import { env } from '@/lib/config/env';

/**
 * Cloudflare D1 backing store for automation_jobs.
 *
 * When D1_AUTOMATION_JOBS_ENABLED=true, ALL automation job reads/writes use
 * this module instead of Neon. Behavior is 100% equivalent to the Neon path:
 * dedupe, claim, defer, cancel, prune, and CF Queue markers all work the same.
 *
 * Database ID resolver: CLOUDFLARE_D1_JOBS_DATABASE_ID →
 *   CLOUDFLARE_D1_DELIVERIES_DATABASE_ID → CLOUDFLARE_D1_DATABASE_ID
 */

const getJobsDatabaseId = () =>
  env.CLOUDFLARE_D1_JOBS_DATABASE_ID.trim()
  || env.CLOUDFLARE_D1_DELIVERIES_DATABASE_ID.trim()
  || env.CLOUDFLARE_D1_DATABASE_ID.trim();

export const isD1AutomationJobsEnabled = () =>
  env.D1_AUTOMATION_JOBS_ENABLED
  && Boolean(env.CLOUDFLARE_ACCOUNT_ID.trim())
  && Boolean(env.CLOUDFLARE_API_TOKEN.trim())
  && Boolean(getJobsDatabaseId());

type D1QueryResult = {
  success: boolean;
  result?: Array<{
    results?: unknown[];
    meta?: Record<string, unknown>;
  }>;
  errors?: Array<{ message?: string }>;
};

const runJobsD1Query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID.trim();
  const databaseId = getJobsDatabaseId();

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    },
  );

  const payload = (await response.json()) as D1QueryResult;
  if (!response.ok || !payload.success) {
    const message = payload.errors?.[0]?.message ?? `D1 jobs query failed (${response.status}).`;
    throw new Error(message);
  }

  return payload.result?.[0]?.results ?? [];
};

const asRows = (rows: unknown[]) => rows as Array<Record<string, unknown>>;

const toIso = (value: unknown): string => {
  if (value == null) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

let schemaReady = false;

export const ensureD1AutomationJobsSchema = async () => {
  if (schemaReady || !isD1AutomationJobsEnabled()) return;

  await runJobsD1Query(`
    CREATE TABLE IF NOT EXISTS automation_jobs (
      id TEXT PRIMARY KEY,
      shop_domain TEXT NOT NULL,
      rule_key TEXT NOT NULL,
      token_id INTEGER,
      subscriber_id INTEGER,
      dedupe_key TEXT,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      due_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sent_at TEXT,
      queue_enqueued_at TEXT
    )
  `);

  await runJobsD1Query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_d1_aj_dedupe
    ON automation_jobs(shop_domain, dedupe_key)
    WHERE dedupe_key IS NOT NULL
  `);
  await runJobsD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_aj_shop_due
    ON automation_jobs(shop_domain, status, due_at)
  `);
  await runJobsD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_aj_queue_promote
    ON automation_jobs(status, queue_enqueued_at, due_at)
    WHERE status = 'pending'
  `);
  await runJobsD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_aj_shop_external
    ON automation_jobs(shop_domain, json_extract(payload, '$.externalId'))
    WHERE json_extract(payload, '$.externalId') IS NOT NULL
  `);

  schemaReady = true;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type D1AutomationJobRow = {
  id: string;
  shop_domain: string;
  rule_key: string;
  token_id: number | null;
  subscriber_id: number | null;
  dedupe_key: string | null;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  error_message: string | null;
  due_at: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  queue_enqueued_at: string | null;
};

type JobPatch = {
  status?: string;
  errorMessage?: string | null;
  dueAt?: string | null;
  sentAt?: string | null;
  queueEnqueuedAt?: string | null;
  /** When true, sets queue_enqueued_at = NULL regardless of queueEnqueuedAt. */
  clearQueue?: boolean;
  payload?: string | null;
};

const parseJobRow = (row: Record<string, unknown>): D1AutomationJobRow => ({
  id: String(row.id ?? ''),
  shop_domain: String(row.shop_domain ?? ''),
  rule_key: String(row.rule_key ?? ''),
  token_id: row.token_id != null ? Number(row.token_id) : null,
  subscriber_id: row.subscriber_id != null ? Number(row.subscriber_id) : null,
  dedupe_key: row.dedupe_key != null ? String(row.dedupe_key) : null,
  payload: (() => {
    try {
      return JSON.parse(String(row.payload ?? '{}')) as Record<string, unknown>;
    } catch {
      return {};
    }
  })(),
  status: String(row.status ?? 'pending'),
  attempts: Number(row.attempts ?? 0),
  error_message: row.error_message != null ? String(row.error_message) : null,
  due_at: String(row.due_at ?? ''),
  created_at: String(row.created_at ?? ''),
  updated_at: String(row.updated_at ?? ''),
  sent_at: row.sent_at != null ? String(row.sent_at) : null,
  queue_enqueued_at: row.queue_enqueued_at != null ? String(row.queue_enqueued_at) : null,
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Enqueue an automation job with optional dedupe. Mirrors the Neon path:
 * 1. Delete failed/skipped rows with same dedupe_key.
 * 2. Refresh an existing pending row (bump due_at + payload).
 * 3. INSERT if no pending row existed.
 * Returns the job id, or null if a conflict prevented insert.
 */
export const d1EnqueueAutomationJob = async (input: {
  id: string;
  shopDomain: string;
  ruleKey: string;
  tokenId?: number | null;
  subscriberId?: number | null;
  dedupeKey?: string | null;
  payload: Record<string, unknown>;
  dueAt: Date;
}): Promise<string | null> => {
  await ensureD1AutomationJobsSchema();
  const now = new Date().toISOString();
  const dueAtIso = input.dueAt.toISOString();
  const payloadJson = JSON.stringify(input.payload);

  if (input.dedupeKey) {
    // 1. Delete failed/skipped with same dedupe_key
    await runJobsD1Query(
      `DELETE FROM automation_jobs
       WHERE shop_domain = ? AND dedupe_key = ? AND status IN ('failed', 'skipped')`,
      [input.shopDomain, input.dedupeKey],
    );

    // 2. Refresh existing pending
    const refreshRows = asRows(await runJobsD1Query(
      `UPDATE automation_jobs
       SET due_at = ?, payload = ?, status = 'pending',
           error_message = NULL, queue_enqueued_at = NULL, updated_at = ?
       WHERE shop_domain = ? AND dedupe_key = ? AND status = 'pending'
       RETURNING id`,
      [dueAtIso, payloadJson, now, input.shopDomain, input.dedupeKey],
    ));

    const refreshedId = refreshRows[0] ? String(refreshRows[0].id) : null;
    if (refreshedId) return refreshedId;
  }

  // 3. Insert
  const insertRows = asRows(await runJobsD1Query(
    `INSERT INTO automation_jobs
       (id, shop_domain, rule_key, token_id, subscriber_id, dedupe_key, payload,
        status, attempts, due_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [
      input.id,
      input.shopDomain,
      input.ruleKey,
      input.tokenId ?? null,
      input.subscriberId ?? null,
      input.dedupeKey ?? null,
      payloadJson,
      dueAtIso,
      now,
      now,
    ],
  ));

  return insertRows[0] ? String(insertRows[0].id) : null;
};

/**
 * Atomically claim a pending job → processing (attempts + 1).
 * Returns the full job row, or null if not claimable.
 */
export const d1ClaimAutomationJob = async (
  jobId: string,
): Promise<D1AutomationJobRow | null> => {
  const now = new Date().toISOString();
  const rows = asRows(await runJobsD1Query(
    `UPDATE automation_jobs
     SET status = 'processing', attempts = attempts + 1, updated_at = ?
     WHERE id = ? AND status = 'pending'
     RETURNING id, shop_domain, rule_key, token_id, subscriber_id, payload, attempts,
               dedupe_key, error_message, due_at, created_at, updated_at, sent_at, queue_enqueued_at`,
    [now, jobId],
  ));

  if (!rows[0]) return null;
  return parseJobRow(rows[0]);
};

/** Update fields of an automation job. Only non-undefined fields are written. */
export const d1UpdateAutomationJob = async (
  jobId: string,
  patch: JobPatch,
  whereStatusIn?: string[],
): Promise<void> => {
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (patch.status !== undefined) {
    sets.push('status = ?');
    params.push(patch.status);
  }
  if (patch.errorMessage !== undefined) {
    sets.push('error_message = ?');
    params.push(patch.errorMessage);
  }
  if (patch.dueAt !== undefined) {
    sets.push('due_at = ?');
    params.push(patch.dueAt);
  }
  if (patch.sentAt !== undefined) {
    sets.push('sent_at = ?');
    params.push(patch.sentAt);
  }
  if (patch.clearQueue) {
    sets.push('queue_enqueued_at = NULL');
  } else if (patch.queueEnqueuedAt !== undefined) {
    sets.push('queue_enqueued_at = ?');
    params.push(patch.queueEnqueuedAt);
  }
  if (patch.payload !== undefined) {
    sets.push('payload = ?');
    params.push(patch.payload);
  }

  if (whereStatusIn && whereStatusIn.length > 0) {
    const placeholders = whereStatusIn.map(() => '?').join(', ');
    params.push(jobId);
    params.push(...whereStatusIn);
    await runJobsD1Query(
      `UPDATE automation_jobs SET ${sets.join(', ')} WHERE id = ? AND status IN (${placeholders})`,
      params,
    );
  } else {
    params.push(jobId);
    await runJobsD1Query(
      `UPDATE automation_jobs SET ${sets.join(', ')} WHERE id = ?`,
      params,
    );
  }
};

export const d1MarkQueued = async (jobId: string) => {
  const now = new Date().toISOString();
  await runJobsD1Query(
    `UPDATE automation_jobs SET queue_enqueued_at = ?, updated_at = ? WHERE id = ?`,
    [now, now, jobId],
  );
};

export const d1ClearQueueMarker = async (jobId: string) => {
  const now = new Date().toISOString();
  await runJobsD1Query(
    `UPDATE automation_jobs SET queue_enqueued_at = NULL, updated_at = ? WHERE id = ?`,
    [now, jobId],
  );
};

/**
 * Skip all pending jobs for a given rule on a shop (called when rule is disabled).
 */
export const d1SkipPendingJobsForDisabledRule = async (
  shopDomain: string,
  ruleKey: string,
): Promise<void> => {
  const now = new Date().toISOString();
  await runJobsD1Query(
    `UPDATE automation_jobs
     SET status = 'skipped', error_message = 'Automation rule is disabled.', updated_at = ?
     WHERE shop_domain = ? AND rule_key = ? AND status = 'pending'`,
    [now, shopDomain, ruleKey],
  );
};

/**
 * Cancel pending cart abandonment jobs matching externalId and/or cartToken.
 */
export const d1CancelPendingCartJobs = async (input: {
  shopDomain: string;
  externalId?: string | null;
  cartToken?: string | null;
}): Promise<void> => {
  const externalId = input.externalId?.trim() || null;
  const cartToken = input.cartToken?.trim() || null;
  if (!externalId && !cartToken) return;

  const now = new Date().toISOString();
  const errorMsg = 'Cart recovered before reminder send.';

  if (externalId && cartToken) {
    await runJobsD1Query(
      `UPDATE automation_jobs
       SET status = 'skipped', error_message = ?, updated_at = ?, queue_enqueued_at = NULL
       WHERE shop_domain = ? AND rule_key = 'cart_abandonment_30m' AND status = 'pending'
         AND (json_extract(payload, '$.externalId') = ? OR json_extract(payload, '$.cartToken') = ?)`,
      [errorMsg, now, input.shopDomain, externalId, cartToken],
    );
    return;
  }

  if (externalId) {
    await runJobsD1Query(
      `UPDATE automation_jobs
       SET status = 'skipped', error_message = ?, updated_at = ?, queue_enqueued_at = NULL
       WHERE shop_domain = ? AND rule_key = 'cart_abandonment_30m' AND status = 'pending'
         AND json_extract(payload, '$.externalId') = ?`,
      [errorMsg, now, input.shopDomain, externalId],
    );
    return;
  }

  await runJobsD1Query(
    `UPDATE automation_jobs
     SET status = 'skipped', error_message = ?, updated_at = ?, queue_enqueued_at = NULL
     WHERE shop_domain = ? AND rule_key = 'cart_abandonment_30m' AND status = 'pending'
       AND json_extract(payload, '$.cartToken') = ?`,
    [errorMsg, now, input.shopDomain, cartToken],
  );
};

/**
 * Delete terminal (sent/failed/skipped) jobs updated before cutoffIso.
 * Returns number of deleted rows.
 */
export const d1PruneTerminalJobs = async (cutoffIso: string): Promise<number> => {
  const rows = asRows(await runJobsD1Query(
    `DELETE FROM automation_jobs
     WHERE status IN ('sent', 'failed', 'skipped') AND updated_at < ?
     RETURNING id`,
    [cutoffIso],
  ));
  return rows.length;
};

/**
 * Move stale 'processing' jobs back to 'pending'.
 * Returns count of reclaimed jobs.
 */
export const d1ReclaimStuckProcessing = async (olderThanIso: string): Promise<number> => {
  const now = new Date().toISOString();
  const rows = asRows(await runJobsD1Query(
    `UPDATE automation_jobs
     SET status = 'pending', updated_at = ?
     WHERE status = 'processing' AND updated_at < ?
     RETURNING id`,
    [now, olderThanIso],
  ));
  return rows.length;
};

/**
 * Delete ALL jobs for a shop+rule (used by clearWelcomeAutomationHistory).
 * Returns count of deleted rows.
 */
export const d1DeleteJobsByShopAndRule = async (
  shopDomain: string,
  ruleKey: string,
): Promise<number> => {
  const rows = asRows(await runJobsD1Query(
    `DELETE FROM automation_jobs WHERE shop_domain = ? AND rule_key = ? RETURNING id`,
    [shopDomain, ruleKey],
  ));
  return rows.length;
};

// ---------------------------------------------------------------------------
// Reads — list/probe helpers
// ---------------------------------------------------------------------------

/**
 * Jobs promoteable to the CF Queue: pending, queue null, due within 12 hours.
 */
export const d1ListPromoteableJobs = async (limit = 250): Promise<Array<{ id: string; due_at: string }>> => {
  const now = new Date();
  const in12h = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
  const rows = asRows(await runJobsD1Query(
    `SELECT id, due_at FROM automation_jobs
     WHERE status = 'pending' AND queue_enqueued_at IS NULL
       AND due_at > ? AND due_at <= ?
     ORDER BY due_at ASC LIMIT ?`,
    [now.toISOString(), in12h, limit],
  ));
  return rows.map((r) => ({ id: String(r.id), due_at: String(r.due_at) }));
};

/**
 * Missed jobs: pending, due > 30s ago (for reconcile path).
 */
export const d1ListMissedJobs = async (
  limit = 100,
): Promise<Array<{ id: string; due_at: string; queue_enqueued_at: string | null }>> => {
  const cutoff = new Date(Date.now() - 30 * 1000).toISOString();
  const rows = asRows(await runJobsD1Query(
    `SELECT id, due_at, queue_enqueued_at FROM automation_jobs
     WHERE status = 'pending' AND due_at <= ?
     ORDER BY due_at ASC LIMIT ?`,
    [cutoff, limit],
  ));
  return rows.map((r) => ({
    id: String(r.id),
    due_at: String(r.due_at),
    queue_enqueued_at: r.queue_enqueued_at != null ? String(r.queue_enqueued_at) : null,
  }));
};

/**
 * Due jobs for cron processing (reclaims stale processing first).
 * Returns basic fields; processAutomationJob re-reads token from D1 audience.
 */
export const d1ListDueJobs = async (
  limit = 100,
): Promise<Array<{ id: string; shop_domain: string; rule_key: string; token_id: number | null; subscriber_id: number | null; payload: Record<string, unknown> }>> => {
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Reclaim stale processing
  await runJobsD1Query(
    `UPDATE automation_jobs SET status = 'pending', updated_at = ?
     WHERE status = 'processing' AND updated_at < ?`,
    [now, staleThreshold],
  );

  const safeNow = new Date().toISOString();
  const queueSafetyMs = 90 * 1000;
  const queueSafetyCutoff = new Date(Date.now() - queueSafetyMs).toISOString();

  const rows = asRows(await runJobsD1Query(
    `SELECT id, shop_domain, rule_key, token_id, subscriber_id, payload
     FROM automation_jobs
     WHERE status = 'pending'
       AND due_at <= ?
       AND (queue_enqueued_at IS NULL OR due_at <= ?)
     ORDER BY due_at ASC LIMIT ?`,
    [safeNow, queueSafetyCutoff, limit],
  ));

  return rows.map((r) => ({
    id: String(r.id),
    shop_domain: String(r.shop_domain),
    rule_key: String(r.rule_key),
    token_id: r.token_id != null ? Number(r.token_id) : null,
    subscriber_id: r.subscriber_id != null ? Number(r.subscriber_id) : null,
    payload: (() => {
      try { return JSON.parse(String(r.payload ?? '{}')) as Record<string, unknown>; } catch { return {}; }
    })(),
  }));
};

export const d1ListDueJobsByRule = async (
  ruleKey: string,
  limit = 100,
): Promise<Array<{ id: string; shop_domain: string; rule_key: string; token_id: number | null; subscriber_id: number | null; payload: Record<string, unknown> }>> => {
  const now = new Date().toISOString();
  const staleThreshold = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  await runJobsD1Query(
    `UPDATE automation_jobs SET status = 'pending', updated_at = ?
     WHERE status = 'processing' AND rule_key = ? AND updated_at < ?`,
    [now, ruleKey, staleThreshold],
  );

  const safeNow = new Date().toISOString();
  const queueSafetyCutoff = new Date(Date.now() - 90 * 1000).toISOString();

  const rows = asRows(await runJobsD1Query(
    `SELECT id, shop_domain, rule_key, token_id, subscriber_id, payload
     FROM automation_jobs
     WHERE status = 'pending'
       AND rule_key = ?
       AND due_at <= ?
       AND (queue_enqueued_at IS NULL OR due_at <= ?)
     ORDER BY due_at ASC LIMIT ?`,
    [ruleKey, safeNow, queueSafetyCutoff, limit],
  ));

  return rows.map((r) => ({
    id: String(r.id),
    shop_domain: String(r.shop_domain),
    rule_key: String(r.rule_key),
    token_id: r.token_id != null ? Number(r.token_id) : null,
    subscriber_id: r.subscriber_id != null ? Number(r.subscriber_id) : null,
    payload: (() => {
      try { return JSON.parse(String(r.payload ?? '{}')) as Record<string, unknown>; } catch { return {}; }
    })(),
  }));
};

/**
 * Due jobs for a specific shop (used by processDueAutomationJobsForShop).
 */
export const d1ListDueJobsForShop = async (
  shopDomain: string,
  limit = 50,
): Promise<Array<{ id: string }>> => {
  const now = new Date().toISOString();
  const rows = asRows(await runJobsD1Query(
    `SELECT id FROM automation_jobs
     WHERE shop_domain = ? AND status = 'pending' AND due_at <= ?
     ORDER BY due_at ASC LIMIT ?`,
    [shopDomain, now, limit],
  ));
  return rows.map((r) => ({ id: String(r.id) }));
};

/**
 * Find pending welcome jobs for a specific token (used by dispatchWelcomeJobNow).
 */
export const d1FindPendingWelcomeJobsForToken = async (
  shopDomain: string,
  tokenId: number,
): Promise<Array<{ id: string }>> => {
  const soon = new Date(Date.now() + 5000).toISOString();
  const rows = asRows(await runJobsD1Query(
    `SELECT id FROM automation_jobs
     WHERE shop_domain = ? AND rule_key = 'welcome_subscriber'
       AND token_id = ? AND status = 'pending' AND due_at <= ?
     ORDER BY due_at ASC, created_at ASC LIMIT 20`,
    [shopDomain, tokenId, soon],
  ));
  return rows.map((r) => ({ id: String(r.id) }));
};

// ---------------------------------------------------------------------------
// Canonical check helpers used inside processAutomationJob
// ---------------------------------------------------------------------------

/**
 * Find the first (oldest) active job for a shop/rule/externalId/stepKey.
 * "Active" = status IN ('pending','processing','sent').
 * Returns the job id or null.
 */
export const d1FindFirstActiveJobByExternalIdStep = async (
  shopDomain: string,
  ruleKey: string,
  externalId: string,
  stepKey: string,
): Promise<string | null> => {
  const rows = asRows(await runJobsD1Query(
    `SELECT id FROM automation_jobs
     WHERE shop_domain = ? AND rule_key = ?
       AND json_extract(payload, '$.externalId') = ?
       AND json_extract(payload, '$.metadata.stepKey') = ?
       AND status IN ('pending', 'processing', 'sent')
     ORDER BY created_at ASC LIMIT 1`,
    [shopDomain, ruleKey, externalId, stepKey],
  ));
  return rows[0] ? String(rows[0].id) : null;
};

/**
 * Find the first (oldest) active job for a shop/rule/subscriberId/stepKey.
 */
export const d1FindFirstActiveJobBySubscriberIdStep = async (
  shopDomain: string,
  ruleKey: string,
  subscriberId: number,
  stepKey: string,
): Promise<string | null> => {
  const rows = asRows(await runJobsD1Query(
    `SELECT id FROM automation_jobs
     WHERE shop_domain = ? AND rule_key = ?
       AND subscriber_id = ?
       AND json_extract(payload, '$.metadata.stepKey') = ?
       AND status IN ('pending', 'processing', 'sent')
     ORDER BY created_at ASC LIMIT 1`,
    [shopDomain, ruleKey, subscriberId, stepKey],
  ));
  return rows[0] ? String(rows[0].id) : null;
};

/**
 * Find the first job matching any of the given statuses by externalId+stepKey.
 * Used for welcome ordering checks.
 */
export const d1FindJobByExternalIdStep = async (
  shopDomain: string,
  ruleKey: string,
  externalId: string,
  stepKey: string,
  statuses: string[],
): Promise<string | null> => {
  if (statuses.length === 0) return null;
  const placeholders = statuses.map(() => '?').join(', ');
  const rows = asRows(await runJobsD1Query(
    `SELECT id FROM automation_jobs
     WHERE shop_domain = ? AND rule_key = ?
       AND json_extract(payload, '$.externalId') = ?
       AND json_extract(payload, '$.metadata.stepKey') = ?
       AND status IN (${placeholders})
     ORDER BY created_at ASC LIMIT 1`,
    [shopDomain, ruleKey, externalId, stepKey, ...statuses],
  ));
  return rows[0] ? String(rows[0].id) : null;
};

/**
 * Find the first job matching any statuses by subscriberId+stepKey.
 */
export const d1FindJobBySubscriberIdStep = async (
  shopDomain: string,
  ruleKey: string,
  subscriberId: number,
  stepKey: string,
  statuses: string[],
): Promise<string | null> => {
  if (statuses.length === 0) return null;
  const placeholders = statuses.map(() => '?').join(', ');
  const rows = asRows(await runJobsD1Query(
    `SELECT id FROM automation_jobs
     WHERE shop_domain = ? AND rule_key = ?
       AND subscriber_id = ?
       AND json_extract(payload, '$.metadata.stepKey') = ?
       AND status IN (${placeholders})
     ORDER BY created_at ASC LIMIT 1`,
    [shopDomain, ruleKey, subscriberId, stepKey, ...statuses],
  ));
  return rows[0] ? String(rows[0].id) : null;
};

/**
 * Find the most recent cart previous-step job matching one or more identity fields.
 * Returns { status, attempts, error_message } or null.
 */
export const d1FindCartPreviousStepJob = async (input: {
  shopDomain: string;
  stepKey: string;
  externalId?: string | null;
  cartToken?: string | null;
  subscriberId?: number | null;
}): Promise<{ status: string; attempts: number; error_message: string | null } | null> => {
  const { shopDomain, stepKey, externalId, cartToken, subscriberId } = input;
  let sql: string;
  const params: unknown[] = [shopDomain, stepKey];

  if (externalId && cartToken && subscriberId) {
    sql = `SELECT status, attempts, error_message FROM automation_jobs
           WHERE shop_domain = ? AND rule_key = 'cart_abandonment_30m'
             AND json_extract(payload, '$.metadata.stepKey') = ?
             AND (json_extract(payload, '$.externalId') = ? OR json_extract(payload, '$.cartToken') = ? OR subscriber_id = ?)
           ORDER BY created_at DESC LIMIT 1`;
    params.push(externalId, cartToken, subscriberId);
  } else if (externalId && cartToken) {
    sql = `SELECT status, attempts, error_message FROM automation_jobs
           WHERE shop_domain = ? AND rule_key = 'cart_abandonment_30m'
             AND json_extract(payload, '$.metadata.stepKey') = ?
             AND (json_extract(payload, '$.externalId') = ? OR json_extract(payload, '$.cartToken') = ?)
           ORDER BY created_at DESC LIMIT 1`;
    params.push(externalId, cartToken);
  } else if (externalId && subscriberId) {
    sql = `SELECT status, attempts, error_message FROM automation_jobs
           WHERE shop_domain = ? AND rule_key = 'cart_abandonment_30m'
             AND json_extract(payload, '$.metadata.stepKey') = ?
             AND (json_extract(payload, '$.externalId') = ? OR subscriber_id = ?)
           ORDER BY created_at DESC LIMIT 1`;
    params.push(externalId, subscriberId);
  } else if (cartToken && subscriberId) {
    sql = `SELECT status, attempts, error_message FROM automation_jobs
           WHERE shop_domain = ? AND rule_key = 'cart_abandonment_30m'
             AND json_extract(payload, '$.metadata.stepKey') = ?
             AND (json_extract(payload, '$.cartToken') = ? OR subscriber_id = ?)
           ORDER BY created_at DESC LIMIT 1`;
    params.push(cartToken, subscriberId);
  } else if (externalId) {
    sql = `SELECT status, attempts, error_message FROM automation_jobs
           WHERE shop_domain = ? AND rule_key = 'cart_abandonment_30m'
             AND json_extract(payload, '$.metadata.stepKey') = ?
             AND json_extract(payload, '$.externalId') = ?
           ORDER BY created_at DESC LIMIT 1`;
    params.push(externalId);
  } else if (cartToken) {
    sql = `SELECT status, attempts, error_message FROM automation_jobs
           WHERE shop_domain = ? AND rule_key = 'cart_abandonment_30m'
             AND json_extract(payload, '$.metadata.stepKey') = ?
             AND json_extract(payload, '$.cartToken') = ?
           ORDER BY created_at DESC LIMIT 1`;
    params.push(cartToken);
  } else if (subscriberId) {
    sql = `SELECT status, attempts, error_message FROM automation_jobs
           WHERE shop_domain = ? AND rule_key = 'cart_abandonment_30m'
             AND json_extract(payload, '$.metadata.stepKey') = ?
             AND subscriber_id = ?
           ORDER BY created_at DESC LIMIT 1`;
    params.push(subscriberId);
  } else {
    return null;
  }

  const rows = asRows(await runJobsD1Query(sql, params));
  if (!rows[0]) return null;
  return {
    status: String(rows[0].status ?? ''),
    attempts: Number(rows[0].attempts ?? 0),
    error_message: rows[0].error_message != null ? String(rows[0].error_message) : null,
  };
};

// ---------------------------------------------------------------------------
// Probe / health helpers
// ---------------------------------------------------------------------------

/**
 * Lightweight probe for cron-work-probe: returns binary 0/1 flags so the
 * cron can decide whether to wake without reading automation_jobs on Neon.
 */
export const d1ProbeJobsWork = async (): Promise<{
  dueAutomationJobs: 0 | 1;
  promoteableAutomationJobs: 0 | 1;
  nextWakeAt: Date | null;
}> => {
  const now = new Date();
  const soon = new Date(now.getTime() + 90 * 1000).toISOString();
  const queueSafety = new Date(now.getTime() - 90 * 1000).toISOString();
  const in12h = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const [dueRows, promoteRows, wakeRows] = await Promise.all([
    runJobsD1Query(
      `SELECT 1 FROM automation_jobs
       WHERE status = 'pending' AND due_at <= ?
         AND (queue_enqueued_at IS NULL OR due_at <= ?)
       LIMIT 1`,
      [soon, queueSafety],
    ),
    runJobsD1Query(
      `SELECT 1 FROM automation_jobs
       WHERE status = 'pending' AND queue_enqueued_at IS NULL AND due_at <= ?
       LIMIT 1`,
      [in12h],
    ),
    runJobsD1Query(
      `SELECT MIN(due_at) AS next_due FROM automation_jobs
       WHERE status = 'pending' AND due_at > ?`,
      [nowIso],
    ),
  ]);

  const nextDueRaw = asRows(wakeRows)[0]?.next_due;
  const nextWakeAt = nextDueRaw ? new Date(String(nextDueRaw)) : null;

  return {
    dueAutomationJobs: dueRows.length > 0 ? 1 : 0,
    promoteableAutomationJobs: promoteRows.length > 0 ? 1 : 0,
    nextWakeAt: nextWakeAt && !Number.isNaN(nextWakeAt.getTime()) ? nextWakeAt : null,
  };
};

export const d1CountJobsByStatus = async (
  shopDomain: string,
): Promise<Record<string, number>> => {
  const rows = asRows(await runJobsD1Query(
    `SELECT status, COUNT(*) AS cnt FROM automation_jobs WHERE shop_domain = ? GROUP BY status`,
    [shopDomain],
  ));
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[String(row.status)] = Number(row.cnt ?? 0);
  }
  return result;
};

export const d1LastSentAt = async (shopDomain: string): Promise<string | null> => {
  const rows = asRows(await runJobsD1Query(
    `SELECT MAX(sent_at) AS last_sent FROM automation_jobs WHERE shop_domain = ? AND status = 'sent'`,
    [shopDomain],
  ));
  const val = rows[0]?.last_sent;
  return val != null ? String(val) : null;
};

export { toIso };
