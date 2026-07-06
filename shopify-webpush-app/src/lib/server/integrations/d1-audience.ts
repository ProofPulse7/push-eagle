import { env } from '@/lib/config/env';

/**
 * Cloudflare D1 backing store for the audience: `subscribers` + `subscriber_tokens`.
 *
 * This is the largest and most send-critical dataset (one push token per
 * subscriber). Moving it off Neon is what makes 1M subscribers fit inside the
 * Neon free tier (storage) and keeps campaign sends from reading hundreds of MB
 * of tokens out of Neon (transfer).
 *
 * Because it powers *all* push delivery, the migration is staged via
 * `D1_AUDIENCE_MODE`:
 *   - off        : Neon only (default, current behavior).
 *   - dual_write : every subscriber/token write is *also* mirrored into D1
 *                  (best-effort, never throws). Reads stay on Neon. This lets us
 *                  build up a verified D1 copy with zero behavior change.
 *   - shadow     : dual-write + reads run BOTH and log mismatches (Neon wins).
 *   - read       : D1 is the source of truth for reads (Neon fallback on error);
 *                  writes still dual-write to Neon so it stays a hot standby.
 *   - d1_only    : D1 is the SOLE store. Reads use D1; writes go only to D1,
 *                  which assigns ids (Neon audience tables stop being written).
 *                  This is the step that actually frees Neon storage.
 *
 * Ids are kept identical to Neon through the dual_write/shadow/read stages: Neon
 * assigns the BIGSERIAL id and we mirror the row into D1 with that explicit id.
 * That id parity is what makes the read cutover safe — every campaign_deliveries
 * / automation_deliveries row on Neon keeps referencing a valid audience id. In
 * d1_only, D1 assigns new ids (continuing past the backfilled max, so they never
 * collide with the historical Neon ids that other tables still reference).
 */

export type D1AudienceMode = 'off' | 'dual_write' | 'shadow' | 'read' | 'd1_only';

/**
 * Database id for the audience. Prefers the dedicated audience DB so the
 * crown-jewel subscribers + subscriber_tokens are physically isolated from the
 * high-volume event/catalog data. Falls back to the primary DB id so nothing
 * changes until the dedicated DB is provisioned.
 */
const getAudienceDatabaseId = () =>
  env.CLOUDFLARE_D1_AUDIENCE_DATABASE_ID.trim() || env.CLOUDFLARE_D1_DATABASE_ID.trim();

const hasD1Creds = () =>
  Boolean(env.CLOUDFLARE_ACCOUNT_ID.trim())
  && Boolean(env.CLOUDFLARE_API_TOKEN.trim())
  && Boolean(getAudienceDatabaseId());

export const getD1AudienceMode = (): D1AudienceMode => {
  const mode = env.D1_AUDIENCE_MODE as D1AudienceMode;
  if (
    (mode === 'dual_write' || mode === 'shadow' || mode === 'read' || mode === 'd1_only') &&
    hasD1Creds()
  ) {
    return mode;
  }
  return 'off';
};

/** True when any D1 write should happen (dual_write, shadow, read, or d1_only). */
export const isD1AudienceWriteEnabled = () => getD1AudienceMode() !== 'off';

/**
 * True when D1 is the source of truth for reads. Both `read` and `d1_only` serve
 * reads from D1; the only difference is whether Neon is still written.
 */
export const isD1AudienceReadActive = () => {
  const mode = getD1AudienceMode();
  return mode === 'read' || mode === 'd1_only';
};

/** @deprecated use {@link isD1AudienceReadActive}. Kept for existing call sites. */
export const isD1AudienceReadEnabled = () => isD1AudienceReadActive();

/** True when reads should be shadow-compared (Neon authoritative, D1 logged). */
export const isD1AudienceShadow = () => getD1AudienceMode() === 'shadow';

/**
 * True only in the final `d1_only` cutover: Neon audience tables are no longer
 * written and D1 becomes the sole authority (D1 assigns ids on write).
 */
export const isD1AudienceOnly = () => getD1AudienceMode() === 'd1_only';

/**
 * Central read router for the audience cutover. Wrap each Neon audience read with
 * its D1 equivalent and this decides what to do based on D1_AUDIENCE_MODE:
 *   - off / dual_write : run only Neon (current behavior).
 *   - shadow           : run BOTH in parallel, return Neon, log any mismatch.
 *   - read             : return D1; if the D1 read throws, fall back to Neon.
 *
 * `key` produces a canonical, order-independent string for mismatch detection
 * (e.g. sorted ids). Defaults to JSON.stringify.
 */
export const audienceRead = async <T>(opts: {
  label: string;
  neon: () => Promise<T>;
  d1: () => Promise<T>;
  key?: (result: T) => string;
}): Promise<T> => {
  const mode = getD1AudienceMode();

  if (mode === 'read' || mode === 'd1_only') {
    try {
      const d1Result = await opts.d1();
      if (mode === 'read') {
        const isEmpty =
          d1Result == null
          || (Array.isArray(d1Result) && d1Result.length === 0);
        if (isEmpty) {
          const neonResult = await opts.neon();
          if (neonResult != null && !(Array.isArray(neonResult) && neonResult.length === 0)) {
            return neonResult;
          }
        }
      }
      return d1Result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      // In d1_only Neon is stale, but falling back still beats crashing a read.
      console.warn(`[d1-audience] read '${opts.label}' failed, falling back to Neon: ${message}`);
      return await opts.neon();
    }
  }

  if (mode === 'shadow') {
    const [neonResult, d1Settled] = await Promise.all([
      opts.neon(),
      opts.d1().then(
        (value) => ({ ok: true as const, value }),
        (error) => ({ ok: false as const, error }),
      ),
    ]);

    if (!d1Settled.ok) {
      const message =
        d1Settled.error instanceof Error ? d1Settled.error.message : String(d1Settled.error ?? '');
      console.warn(`[d1-audience] shadow '${opts.label}' D1 read error: ${message}`);
      return neonResult;
    }

    try {
      const toKey = opts.key ?? ((value: T) => JSON.stringify(value));
      const neonKey = toKey(neonResult);
      const d1Key = toKey(d1Settled.value);
      if (neonKey === d1Key) {
        console.log(`[d1-audience] shadow OK '${opts.label}'`);
      } else {
        console.warn(
          `[d1-audience] SHADOW MISMATCH '${opts.label}'\n  neon=${neonKey.slice(0, 800)}\n  d1  =${d1Key.slice(0, 800)}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      console.warn(`[d1-audience] shadow '${opts.label}' compare error: ${message}`);
    }

    return neonResult;
  }

  return opts.neon();
};

type D1QueryResult = {
  success: boolean;
  result?: Array<{
    results?: unknown[];
    meta?: Record<string, unknown>;
  }>;
  errors?: Array<{ message?: string }>;
};

const runD1Query = async (sql: string, params: unknown[] = []) => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID.trim();
  const databaseId = getAudienceDatabaseId();

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
    const message = payload.errors?.[0]?.message ?? `D1 audience query failed (${response.status}).`;
    throw new Error(message);
  }

  return payload.result?.[0]?.results ?? [];
};

/**
 * Cloudflare D1 caps a single query at 100 bound parameters
 * (https://developers.cloudflare.com/d1/platform/limits/). Every multi-row
 * insert and IN(...) list must be chunked to stay at/under this.
 */
const D1_MAX_PARAMS = 100;

let schemaReady = false;

export const ensureD1AudienceSchema = async () => {
  if (schemaReady || !isD1AudienceWriteEnabled()) {
    return;
  }

  await runD1Query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY,
      shop_domain TEXT NOT NULL,
      external_id TEXT NOT NULL,
      browser TEXT,
      platform TEXT,
      locale TEXT,
      country TEXT,
      city TEXT,
      device_context TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      ios_home_screen_confirmed_at TEXT,
      ios_home_screen_last_seen_at TEXT
    )
  `);
  await runD1Query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_d1_subscribers_shop_external
    ON subscribers(shop_domain, external_id)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_subscribers_shop
    ON subscribers(shop_domain)
  `);

  await runD1Query(`
    CREATE TABLE IF NOT EXISTS subscriber_tokens (
      id INTEGER PRIMARY KEY,
      shop_domain TEXT NOT NULL,
      subscriber_id INTEGER NOT NULL,
      fcm_token TEXT NOT NULL,
      user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      token_type TEXT NOT NULL DEFAULT 'fcm',
      vapid_endpoint TEXT,
      vapid_p256dh TEXT,
      vapid_auth TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )
  `);
  await runD1Query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_d1_tokens_shop_fcm
    ON subscriber_tokens(shop_domain, fcm_token)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_tokens_subscriber
    ON subscriber_tokens(subscriber_id)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_tokens_shop_status
    ON subscriber_tokens(shop_domain, status)
  `);

  schemaReady = true;
};

const nowIso = () => new Date().toISOString();

const toIso = (value: unknown): string => {
  if (!value) {
    return nowIso();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? nowIso() : parsed.toISOString();
};

const toIsoOrNull = (value: unknown): string | null => {
  if (value == null || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/** Log + swallow: dual-write must never break the primary (Neon) write path. */
const bestEffort = async (label: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    console.warn(`[d1-audience] ${label} mirror failed (non-fatal): ${message}`);
  }
};

export type D1SubscriberMirror = {
  id: number;
  shopDomain: string;
  externalId: string;
  browser: string | null;
  platform: string | null;
  locale: string | null;
  country: string | null;
  city: string | null;
  deviceContext: string | null;
  lastSeenAt?: unknown;
  iosHomeScreenConfirmedAt?: unknown;
  iosHomeScreenLastSeenAt?: unknown;
};

/**
 * Mirror a subscriber row into D1 using the Neon-assigned id, matching the Neon
 * upsert's COALESCE semantics so re-subscribes never wipe existing geo/context.
 */
export const d1MirrorSubscriber = async (input: D1SubscriberMirror) => {
  if (!isD1AudienceWriteEnabled() || !Number.isFinite(input.id)) {
    return;
  }
  await bestEffort('subscriber', async () => {
    await ensureD1AudienceSchema();
    const seenAt = toIso(input.lastSeenAt);
    await runD1Query(
      `
        INSERT INTO subscribers (
          id, shop_domain, external_id, browser, platform, locale, country, city,
          device_context, created_at, last_seen_at,
          ios_home_screen_confirmed_at, ios_home_screen_last_seen_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          browser = excluded.browser,
          platform = excluded.platform,
          locale = excluded.locale,
          country = COALESCE(NULLIF(excluded.country, ''), subscribers.country),
          city = COALESCE(excluded.city, subscribers.city),
          device_context = COALESCE(excluded.device_context, subscribers.device_context),
          last_seen_at = excluded.last_seen_at,
          ios_home_screen_confirmed_at = COALESCE(
            subscribers.ios_home_screen_confirmed_at, excluded.ios_home_screen_confirmed_at
          ),
          ios_home_screen_last_seen_at = COALESCE(
            excluded.ios_home_screen_last_seen_at, subscribers.ios_home_screen_last_seen_at
          )
      `,
      [
        input.id,
        input.shopDomain,
        input.externalId,
        input.browser,
        input.platform,
        input.locale,
        input.country,
        input.city,
        input.deviceContext,
        seenAt,
        seenAt,
        toIsoOrNull(input.iosHomeScreenConfirmedAt),
        toIsoOrNull(input.iosHomeScreenLastSeenAt),
      ],
    );
  });
};

export type D1TokenMirror = {
  id: number;
  shopDomain: string;
  subscriberId: number;
  fcmToken: string;
  userAgent: string | null;
  status: string;
  tokenType: string;
  vapidEndpoint: string | null;
  vapidP256dh: string | null;
  vapidAuth: string | null;
  updatedAt?: unknown;
  lastSeenAt?: unknown;
};

export const d1MirrorToken = async (input: D1TokenMirror) => {
  if (!isD1AudienceWriteEnabled() || !Number.isFinite(input.id)) {
    return;
  }
  await bestEffort('token', async () => {
    await ensureD1AudienceSchema();
    const updatedAt = toIso(input.updatedAt);
    const seenAt = toIso(input.lastSeenAt);
    await runD1Query(
      `
        INSERT INTO subscriber_tokens (
          id, shop_domain, subscriber_id, fcm_token, user_agent, status, token_type,
          vapid_endpoint, vapid_p256dh, vapid_auth, created_at, updated_at, last_seen_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          subscriber_id = excluded.subscriber_id,
          user_agent = excluded.user_agent,
          token_type = excluded.token_type,
          vapid_endpoint = COALESCE(excluded.vapid_endpoint, subscriber_tokens.vapid_endpoint),
          vapid_p256dh = COALESCE(excluded.vapid_p256dh, subscriber_tokens.vapid_p256dh),
          vapid_auth = COALESCE(excluded.vapid_auth, subscriber_tokens.vapid_auth),
          status = excluded.status,
          updated_at = excluded.updated_at,
          last_seen_at = excluded.last_seen_at
      `,
      [
        input.id,
        input.shopDomain,
        input.subscriberId,
        input.fcmToken,
        input.userAgent,
        input.status,
        input.tokenType,
        input.vapidEndpoint,
        input.vapidP256dh,
        input.vapidAuth,
        updatedAt,
        updatedAt,
        seenAt,
      ],
    );
  });
};

export const d1UpdateTokenStatus = async (tokenId: number, status: string) => {
  if (!isD1AudienceWriteEnabled() || !Number.isFinite(tokenId)) {
    return;
  }
  await bestEffort('token-status', async () => {
    await ensureD1AudienceSchema();
    await runD1Query(
      `UPDATE subscriber_tokens SET status = ?, updated_at = ? WHERE id = ?`,
      [status, nowIso(), tokenId],
    );
  });
};

/** Mirror a GDPR/erasure delete. Tokens are removed with their subscribers. */
export const d1DeleteSubscribersByIds = async (shopDomain: string, ids: number[]) => {
  if (!isD1AudienceWriteEnabled()) {
    return;
  }
  const cleanIds = ids.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  if (cleanIds.length === 0) {
    return;
  }
  await bestEffort('subscriber-delete', async () => {
    await ensureD1AudienceSchema();
    // Chunk under D1's 100-param cap (one slot is shop_domain).
    for (const part of chunk(cleanIds, D1_MAX_IN)) {
      const placeholders = part.map(() => '?').join(', ');
      await runD1Query(
        `DELETE FROM subscriber_tokens WHERE shop_domain = ? AND subscriber_id IN (${placeholders})`,
        [shopDomain, ...part],
      );
      await runD1Query(
        `DELETE FROM subscribers WHERE shop_domain = ? AND id IN (${placeholders})`,
        [shopDomain, ...part],
      );
    }
  });
};

export const d1RevokeAllTokensForShop = async (shopDomain: string) => {
  if (!isD1AudienceWriteEnabled()) {
    return;
  }
  await bestEffort('shop-revoke', async () => {
    await ensureD1AudienceSchema();
    await runD1Query(
      `UPDATE subscriber_tokens SET status = 'revoked', updated_at = ? WHERE shop_domain = ?`,
      [nowIso(), shopDomain],
    );
  });
};

export const d1DeleteAllAudienceForShop = async (shopDomain: string) => {
  if (!isD1AudienceWriteEnabled()) {
    return;
  }
  await bestEffort('shop-purge', async () => {
    await ensureD1AudienceSchema();
    await runD1Query(`DELETE FROM subscriber_tokens WHERE shop_domain = ?`, [shopDomain]);
    await runD1Query(`DELETE FROM subscribers WHERE shop_domain = ?`, [shopDomain]);
  });
};

// ---------------------------------------------------------------------------
// Backfill (Stage 1): copy existing Neon rows into D1 with identical ids.
// These throw on error so the backfill endpoint can surface + retry failures.
// ---------------------------------------------------------------------------

export type D1BackfillSubscriberRow = {
  id: number;
  shop_domain: string;
  external_id: string;
  browser: string | null;
  platform: string | null;
  locale: string | null;
  country: string | null;
  city: string | null;
  device_context: string | null;
  created_at: unknown;
  last_seen_at: unknown;
  ios_home_screen_confirmed_at: unknown;
  ios_home_screen_last_seen_at: unknown;
};

export const d1BackfillSubscribers = async (rows: D1BackfillSubscriberRow[]) => {
  if (rows.length === 0) {
    return;
  }
  await ensureD1AudienceSchema();
  const cols = 13;
  // D1 allows at most 100 bound parameters per query -> floor(100/13) = 7 rows.
  const rowsPerInsert = Math.max(1, Math.floor(D1_MAX_PARAMS / cols));
  for (let start = 0; start < rows.length; start += rowsPerInsert) {
    const group = rows.slice(start, start + rowsPerInsert);
    const values = group
      .map(() => `(${Array.from({ length: cols }, () => '?').join(', ')})`)
      .join(', ');
    const params: unknown[] = [];
    for (const row of group) {
      params.push(
        Number(row.id),
        row.shop_domain,
        row.external_id,
        row.browser,
        row.platform,
        row.locale,
        row.country,
        row.city,
        row.device_context,
        toIso(row.created_at),
        toIso(row.last_seen_at),
        toIsoOrNull(row.ios_home_screen_confirmed_at),
        toIsoOrNull(row.ios_home_screen_last_seen_at),
      );
    }
    await runD1Query(
      `
        INSERT INTO subscribers (
          id, shop_domain, external_id, browser, platform, locale, country, city,
          device_context, created_at, last_seen_at,
          ios_home_screen_confirmed_at, ios_home_screen_last_seen_at
        )
        VALUES ${values}
        ON CONFLICT(id) DO UPDATE SET
          browser = excluded.browser,
          platform = excluded.platform,
          locale = excluded.locale,
          country = excluded.country,
          city = excluded.city,
          device_context = excluded.device_context,
          last_seen_at = excluded.last_seen_at,
          ios_home_screen_confirmed_at = excluded.ios_home_screen_confirmed_at,
          ios_home_screen_last_seen_at = excluded.ios_home_screen_last_seen_at
      `,
      params,
    );
  }
};

export type D1BackfillTokenRow = {
  id: number;
  shop_domain: string;
  subscriber_id: number;
  fcm_token: string;
  user_agent: string | null;
  status: string;
  token_type: string | null;
  vapid_endpoint: string | null;
  vapid_p256dh: string | null;
  vapid_auth: string | null;
  created_at: unknown;
  updated_at: unknown;
  last_seen_at: unknown;
};

export const d1BackfillTokens = async (rows: D1BackfillTokenRow[]) => {
  if (rows.length === 0) {
    return;
  }
  await ensureD1AudienceSchema();
  const cols = 13;
  // D1 allows at most 100 bound parameters per query -> floor(100/13) = 7 rows.
  const rowsPerInsert = Math.max(1, Math.floor(D1_MAX_PARAMS / cols));
  for (let start = 0; start < rows.length; start += rowsPerInsert) {
    const group = rows.slice(start, start + rowsPerInsert);
    const values = group
      .map(() => `(${Array.from({ length: cols }, () => '?').join(', ')})`)
      .join(', ');
    const params: unknown[] = [];
    for (const row of group) {
      params.push(
        Number(row.id),
        row.shop_domain,
        Number(row.subscriber_id),
        row.fcm_token,
        row.user_agent,
        row.status || 'active',
        row.token_type || 'fcm',
        row.vapid_endpoint,
        row.vapid_p256dh,
        row.vapid_auth,
        toIso(row.created_at),
        toIso(row.updated_at),
        toIso(row.last_seen_at),
      );
    }
    await runD1Query(
      `
        INSERT INTO subscriber_tokens (
          id, shop_domain, subscriber_id, fcm_token, user_agent, status, token_type,
          vapid_endpoint, vapid_p256dh, vapid_auth, created_at, updated_at, last_seen_at
        )
        VALUES ${values}
        ON CONFLICT(id) DO UPDATE SET
          subscriber_id = excluded.subscriber_id,
          user_agent = excluded.user_agent,
          status = excluded.status,
          token_type = excluded.token_type,
          vapid_endpoint = excluded.vapid_endpoint,
          vapid_p256dh = excluded.vapid_p256dh,
          vapid_auth = excluded.vapid_auth,
          updated_at = excluded.updated_at,
          last_seen_at = excluded.last_seen_at
      `,
      params,
    );
  }
};

// ---------------------------------------------------------------------------
// Read primitives (Stage 2): D1 equivalents of the Neon audience reads. Each is
// written to return the same shape as its Neon counterpart so it can be diffed
// in shadow mode and swapped in for read mode.
// ---------------------------------------------------------------------------

// D1 binds at most 100 params per statement; keep headroom for other bound
// values (shop_domain, date filters) that ride alongside the IN(...) list.
const D1_MAX_IN = 80;

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

// Matches the Neon "active + deliverable" predicate: an active token that is
// either a usable VAPID subscription or a usable FCM token.
const DELIVERABLE_TOKEN_PREDICATE = `
  t.status = 'active'
  AND (
    (
      COALESCE(t.token_type, 'fcm') = 'vapid'
      AND t.vapid_endpoint IS NOT NULL AND TRIM(t.vapid_endpoint) <> ''
      AND t.vapid_p256dh IS NOT NULL AND TRIM(t.vapid_p256dh) <> ''
      AND t.vapid_auth IS NOT NULL AND TRIM(t.vapid_auth) <> ''
    )
    OR (
      COALESCE(t.token_type, 'fcm') <> 'vapid'
      AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
    )
  )
`;

export type D1CampaignRecipient = {
  token_id: number;
  fcm_token: string;
  token_type: string | null;
  vapid_endpoint: string | null;
  vapid_p256dh: string | null;
  vapid_auth: string | null;
  subscriber_id: number;
  external_id: string | null;
  platform: string | null;
  user_agent: string | null;
};

const mapRecipient = (row: Record<string, unknown>): D1CampaignRecipient => ({
  token_id: Number(row.token_id),
  fcm_token: row.fcm_token == null ? '' : String(row.fcm_token),
  token_type: row.token_type == null ? null : String(row.token_type),
  vapid_endpoint: row.vapid_endpoint == null ? null : String(row.vapid_endpoint),
  vapid_p256dh: row.vapid_p256dh == null ? null : String(row.vapid_p256dh),
  vapid_auth: row.vapid_auth == null ? null : String(row.vapid_auth),
  subscriber_id: Number(row.subscriber_id),
  external_id: row.external_id == null ? null : String(row.external_id),
  platform: row.platform == null ? null : String(row.platform),
  user_agent: row.user_agent == null ? null : String(row.user_agent),
});

const RECIPIENT_SELECT = `
  SELECT token_id, fcm_token, token_type, vapid_endpoint, vapid_p256dh, vapid_auth,
         subscriber_id, external_id, platform, user_agent
  FROM (
    SELECT
      t.id AS token_id, t.fcm_token, t.token_type, t.vapid_endpoint, t.vapid_p256dh,
      t.vapid_auth, s.id AS subscriber_id, s.external_id, s.platform, t.user_agent,
      ROW_NUMBER() OVER (
        PARTITION BY s.id
        ORDER BY t.last_seen_at DESC, t.updated_at DESC, t.id DESC
      ) AS rn
    FROM subscribers s
    JOIN subscriber_tokens t ON t.subscriber_id = s.id
    WHERE s.shop_domain = ? AND t.shop_domain = ?
      AND __DELIVERABLE__
      __ID_FILTER__
  )
  WHERE rn = 1
`;

/**
 * One deliverable token per subscriber (the most recent), mirroring the Neon
 * `DISTINCT ON (s.id) ... ORDER BY last_seen_at DESC, updated_at DESC, id DESC`.
 * Optionally restricted to a set of subscriber ids (segment). Delivery de-dup is
 * applied by the caller (subscriber ids come from Neon campaign_deliveries).
 */
export const d1ResolveCampaignRecipients = async (
  shopDomain: string,
  subscriberIds?: number[],
): Promise<D1CampaignRecipient[]> => {
  await ensureD1AudienceSchema();

  if (subscriberIds && subscriberIds.length === 0) {
    return [];
  }

  const runChunk = async (ids?: number[]) => {
    const params: unknown[] = [shopDomain, shopDomain];
    let idFilter = '';
    if (ids) {
      idFilter = `AND s.id IN (${ids.map(() => '?').join(', ')})`;
      params.push(...ids);
    }
    const sql = RECIPIENT_SELECT
      .replace('__DELIVERABLE__', DELIVERABLE_TOKEN_PREDICATE)
      .replace('__ID_FILTER__', idFilter);
    const rows = await runD1Query(sql, params);
    return (rows as Array<Record<string, unknown>>).map(mapRecipient);
  };

  if (!subscriberIds) {
    const result = await runChunk();
    result.sort((a, b) => a.subscriber_id - b.subscriber_id);
    return result;
  }

  // Chunk large segment id lists. Chunks partition by subscriber id, so results
  // are disjoint by subscriber and can be concatenated safely.
  const result: D1CampaignRecipient[] = [];
  for (const ids of chunk(subscriberIds, D1_MAX_IN)) {
    result.push(...(await runChunk(ids)));
  }
  result.sort((a, b) => a.subscriber_id - b.subscriber_id);
  return result;
};

export type D1FcmTarget = { tokenId: number; externalId: string; fcmToken: string };

/**
 * FCM-only best-token-per-subscriber, mirroring notification-batch getTargetTokens
 * (which intentionally ignores VAPID and only sends via FCM).
 */
export const d1GetFcmTargetTokens = async (shopDomain: string): Promise<D1FcmTarget[]> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `
      SELECT token_id, external_id, fcm_token
      FROM (
        SELECT
          t.id AS token_id, s.external_id, t.fcm_token, s.id AS subscriber_id,
          ROW_NUMBER() OVER (
            PARTITION BY s.id
            ORDER BY t.last_seen_at DESC, t.updated_at DESC, t.id DESC
          ) AS rn
        FROM subscriber_tokens t
        JOIN subscribers s ON s.id = t.subscriber_id
        WHERE t.shop_domain = ?
          AND t.status = 'active'
          AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
      )
      WHERE rn = 1
      ORDER BY subscriber_id
    `,
    [shopDomain],
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    tokenId: Number(row.token_id),
    externalId: row.external_id == null ? '' : String(row.external_id),
    fcmToken: row.fcm_token == null ? '' : String(row.fcm_token),
  }));
};

// Automation "targetable" predicate: active token that is either non-VAPID (FCM,
// even if empty here to match the Neon query) or a VAPID subscription with keys.
const AUTOMATION_TARGET_PREDICATE = `
  t.status = 'active'
  AND (
    COALESCE(t.token_type, 'fcm') <> 'vapid'
    OR (
      COALESCE(t.vapid_endpoint, '') <> ''
      AND COALESCE(t.vapid_p256dh, '') <> ''
      AND COALESCE(t.vapid_auth, '') <> ''
    )
  )
`;

export type D1AutomationTarget = {
  tokenId: number;
  subscriberId: number | null;
  externalId: string | null;
};

const mapAutomationTarget = (row: Record<string, unknown>): D1AutomationTarget => ({
  tokenId: Number(row.token_id),
  subscriberId: row.subscriber_id ? Number(row.subscriber_id) : null,
  externalId: row.external_id ? String(row.external_id) : null,
});

const runAutomationTargets = async (
  shopDomain: string,
  partitionCol: 'id' | 'external_id',
  whereClause: string,
  whereParams: unknown[],
): Promise<D1AutomationTarget[]> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `
      SELECT token_id, subscriber_id, external_id
      FROM (
        SELECT
          t.id AS token_id, s.id AS subscriber_id, s.external_id,
          ROW_NUMBER() OVER (
            PARTITION BY s.${partitionCol}
            ORDER BY t.last_seen_at DESC, t.updated_at DESC, t.id DESC
          ) AS rn
        FROM subscriber_tokens t
        JOIN subscribers s ON s.id = t.subscriber_id
        WHERE t.shop_domain = ?
          AND ${AUTOMATION_TARGET_PREDICATE}
          AND ${whereClause}
      )
      WHERE rn = 1
    `,
    [shopDomain, ...whereParams],
  );
  return (rows as Array<Record<string, unknown>>).map(mapAutomationTarget);
};

export const d1AutomationTargetsBySubscriberId = (shopDomain: string, subscriberId: number) =>
  runAutomationTargets(shopDomain, 'id', 's.id = ?', [subscriberId]);

export const d1AutomationTargetsByExternalId = (shopDomain: string, externalId: string) =>
  runAutomationTargets(shopDomain, 'external_id', 's.external_id = ?', [externalId ?? '']);

export const d1AutomationTargetsByExternalIds = async (
  shopDomain: string,
  externalIds: string[],
): Promise<D1AutomationTarget[]> => {
  if (externalIds.length === 0) {
    return [];
  }
  const out: D1AutomationTarget[] = [];
  for (const ids of chunk(externalIds, D1_MAX_IN)) {
    const placeholders = ids.map(() => '?').join(', ');
    out.push(...(await runAutomationTargets(shopDomain, 'external_id', `s.external_id IN (${placeholders})`, ids)));
  }
  return out;
};

export const d1AutomationTargetsByClientId = (shopDomain: string, clientId: string) =>
  runAutomationTargets(
    shopDomain,
    'id',
    `s.shop_domain = ? AND (
       COALESCE(json_extract(s.device_context, '$.clientId'), '') = ?
       OR COALESCE(json_extract(s.device_context, '$.shopifyAnalyticsClientId'), '') = ?
     )`,
    [shopDomain, clientId, clientId],
  );

export const d1ListAllSubscriberIds = async (shopDomain: string): Promise<number[]> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(`SELECT id FROM subscribers WHERE shop_domain = ?`, [shopDomain]);
  return (rows as Array<Record<string, unknown>>)
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id));
};

export type D1SubscribedRow = { id: number; created_at: string | null };

export const d1GetSubscribedRows = async (shopDomain: string): Promise<D1SubscribedRow[]> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `SELECT id, created_at FROM subscribers WHERE shop_domain = ?`,
    [shopDomain],
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    created_at: row.created_at == null ? null : String(row.created_at),
  }));
};

export type D1LocationRow = {
  id: number;
  country: string | null;
  city: string | null;
  region: string | null;
};

export const d1GetLocationRows = async (shopDomain: string): Promise<D1LocationRow[]> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `SELECT id, country, city, device_context FROM subscribers WHERE shop_domain = ?`,
    [shopDomain],
  );
  return (rows as Array<Record<string, unknown>>).map((row) => {
    let region: string | null = null;
    const ctx = row.device_context;
    if (ctx != null) {
      try {
        const parsed = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;
        if (parsed && typeof parsed === 'object' && 'region' in parsed) {
          const value = (parsed as Record<string, unknown>).region;
          region = value == null ? null : String(value);
        }
      } catch {
        region = null;
      }
    }
    return {
      id: Number(row.id),
      country: row.country == null ? null : String(row.country),
      city: row.city == null ? null : String(row.city),
      region,
    };
  });
};

export type D1IdExternalIdRow = { id: number; external_id: string | null };

export const d1GetSubscriberIdExternalIdPairs = async (
  shopDomain: string,
): Promise<D1IdExternalIdRow[]> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `SELECT id, external_id FROM subscribers WHERE shop_domain = ? AND external_id IS NOT NULL`,
    [shopDomain],
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: Number(row.id),
    external_id: row.external_id == null ? null : String(row.external_id),
  }));
};

const d1DistinctTrimmed = async (
  shopDomain: string,
  column: 'country' | 'city',
  limit: number,
): Promise<string[]> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `
      SELECT DISTINCT TRIM(${column}) AS value
      FROM subscribers
      WHERE shop_domain = ? AND ${column} IS NOT NULL AND TRIM(${column}) <> ''
      ORDER BY value ASC
      LIMIT ?
    `,
    [shopDomain, limit],
  );
  return (rows as Array<Record<string, unknown>>)
    .map((row) => (row.value == null ? '' : String(row.value)))
    .filter(Boolean);
};

export const d1GetDistinctCountries = (shopDomain: string, limit = 300) =>
  d1DistinctTrimmed(shopDomain, 'country', limit);

export const d1GetDistinctCities = (shopDomain: string, limit = 500) =>
  d1DistinctTrimmed(shopDomain, 'city', limit);

export const d1GetDistinctRegions = async (shopDomain: string, limit = 500): Promise<string[]> => {
  await ensureD1AudienceSchema();
  // device_context is JSON text in D1; extract region via json_extract.
  const rows = await runD1Query(
    `
      SELECT DISTINCT TRIM(json_extract(device_context, '$.region')) AS value
      FROM subscribers
      WHERE shop_domain = ?
        AND device_context IS NOT NULL
        AND TRIM(COALESCE(json_extract(device_context, '$.region'), '')) <> ''
      ORDER BY value ASC
      LIMIT ?
    `,
    [shopDomain, limit],
  );
  return (rows as Array<Record<string, unknown>>)
    .map((row) => (row.value == null ? '' : String(row.value)))
    .filter(Boolean);
};

/**
 * COUNT(DISTINCT subscriber) that have at least one active, deliverable token,
 * mirroring getMerchantOverview / countActiveDeliverableSubscribers / KPIs.
 * Optional created_at window (ISO strings) for new-vs-previous-period KPIs.
 */
export const d1CountActiveDeliverableSubscribers = async (
  shopDomain: string,
  opts?: { createdSince?: string; createdBefore?: string },
): Promise<number> => {
  await ensureD1AudienceSchema();
  const clauses: string[] = ['s.shop_domain = ?', DELIVERABLE_TOKEN_PREDICATE];
  const params: unknown[] = [shopDomain];
  if (opts?.createdSince) {
    clauses.push('s.created_at >= ?');
    params.push(opts.createdSince);
  }
  if (opts?.createdBefore) {
    clauses.push('s.created_at < ?');
    params.push(opts.createdBefore);
  }
  const rows = await runD1Query(
    `
      SELECT COUNT(DISTINCT s.id) AS count
      FROM subscribers s
      JOIN subscriber_tokens t ON t.subscriber_id = s.id AND t.shop_domain = s.shop_domain
      WHERE ${clauses.join(' AND ')}
    `,
    params,
  );
  return Number((rows as Array<Record<string, unknown>>)[0]?.count ?? 0);
};

export type D1SubscriberListRow = {
  external_id: string | null;
  created_at: string | null;
  web_browser: string;
  os_name: string;
  device_used: string;
  city: string | null;
  country: string | null;
};

export const d1ListSubscribers = async (
  shopDomain: string,
  limit: number,
  offset: number,
  sortOrder: 'asc' | 'desc',
): Promise<D1SubscriberListRow[]> => {
  await ensureD1AudienceSchema();
  const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
  const rows = await runD1Query(
    `
      SELECT
        external_id,
        created_at,
        COALESCE(NULLIF(browser, ''), NULLIF(json_extract(device_context, '$.browserName'), ''), 'unknown') AS web_browser,
        COALESCE(NULLIF(platform, ''), NULLIF(json_extract(device_context, '$.osName'), ''), 'unknown') AS os_name,
        COALESCE(NULLIF(json_extract(device_context, '$.deviceType'), ''), 'unknown') AS device_used,
        NULLIF(city, '') AS city,
        NULLIF(country, '') AS country
      FROM subscribers
      WHERE shop_domain = ?
      ORDER BY created_at ${order}
      LIMIT ? OFFSET ?
    `,
    [shopDomain, limit, offset],
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    external_id: row.external_id == null ? null : String(row.external_id),
    created_at: row.created_at == null ? null : String(row.created_at),
    web_browser: row.web_browser == null ? 'unknown' : String(row.web_browser),
    os_name: row.os_name == null ? 'unknown' : String(row.os_name),
    device_used: row.device_used == null ? 'unknown' : String(row.device_used),
    city: row.city == null ? null : String(row.city),
    country: row.country == null ? null : String(row.country),
  }));
};

// ---------------------------------------------------------------------------
// Verification helpers: prove Neon and D1 counts match before Stage 2 cutover.
// ---------------------------------------------------------------------------

const countRows = async (table: 'subscribers' | 'subscriber_tokens', shopDomain?: string) => {
  await ensureD1AudienceSchema();
  const rows = shopDomain
    ? await runD1Query(`SELECT COUNT(*) AS count FROM ${table} WHERE shop_domain = ?`, [shopDomain])
    : await runD1Query(`SELECT COUNT(*) AS count FROM ${table}`);
  const first = (rows as Array<Record<string, unknown>>)[0];
  return first ? Number(first.count ?? 0) : 0;
};

export const d1CountSubscribers = (shopDomain?: string) => countRows('subscribers', shopDomain);
export const d1CountTokens = (shopDomain?: string) => countRows('subscriber_tokens', shopDomain);

export const d1GetMaxSubscriberId = async (): Promise<number> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(`SELECT MAX(id) AS max_id FROM subscribers`);
  const first = (rows as Array<Record<string, unknown>>)[0];
  return first ? Number(first.max_id ?? 0) : 0;
};

// ---------------------------------------------------------------------------
// Read primitives (Stage 3 / d1_only): the remaining cold-path audience reads.
// These were left on Neon during shadow/read (dual-write kept Neon current), but
// d1_only stops Neon writes, so every one now needs a D1 source. All mirror the
// shape of their Neon counterpart so audienceRead() can shadow-diff + swap them.
// ---------------------------------------------------------------------------

const asString = (value: unknown): string | null => (value == null ? null : String(value));

/** subscriber.id for a (shop, external_id), or null. */
export const d1GetSubscriberIdByExternalId = async (
  shopDomain: string,
  externalId: string,
): Promise<number | null> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `SELECT id FROM subscribers WHERE shop_domain = ? AND external_id = ? LIMIT 1`,
    [shopDomain, externalId],
  );
  const first = (rows as Array<Record<string, unknown>>)[0];
  return first ? Number(first.id) : null;
};

export type D1PlatformBrowser = { platform: string | null; browser: string | null };

export const d1GetSubscriberPlatformBrowserById = async (
  id: number,
): Promise<D1PlatformBrowser | null> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `SELECT platform, browser FROM subscribers WHERE id = ? LIMIT 1`,
    [id],
  );
  const first = (rows as Array<Record<string, unknown>>)[0];
  return first ? { platform: asString(first.platform), browser: asString(first.browser) } : null;
};

export const d1GetSubscriberPlatformBrowserByExternalId = async (
  shopDomain: string,
  externalId: string,
): Promise<D1PlatformBrowser | null> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `SELECT platform, browser FROM subscribers WHERE shop_domain = ? AND external_id = ? LIMIT 1`,
    [shopDomain, externalId],
  );
  const first = (rows as Array<Record<string, unknown>>)[0];
  return first ? { platform: asString(first.platform), browser: asString(first.browser) } : null;
};

/** Map subscriber ids -> external_id (for cross-DB joins where Neon has the ids). */
export const d1GetExternalIdsBySubscriberIds = async (
  ids: number[],
): Promise<Map<number, string>> => {
  const out = new Map<number, string>();
  const clean = ids.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  if (clean.length === 0) {
    return out;
  }
  await ensureD1AudienceSchema();
  for (const part of chunk(clean, D1_MAX_IN)) {
    const placeholders = part.map(() => '?').join(', ');
    const rows = await runD1Query(
      `SELECT id, external_id FROM subscribers WHERE id IN (${placeholders})`,
      part,
    );
    for (const row of rows as Array<Record<string, unknown>>) {
      out.set(Number(row.id), row.external_id == null ? '' : String(row.external_id));
    }
  }
  return out;
};

export type D1TokenRow = {
  id: number;
  fcm_token: string | null;
  token_type: string | null;
  vapid_endpoint: string | null;
  vapid_p256dh: string | null;
  vapid_auth: string | null;
  status: string | null;
  user_agent: string | null;
};

const mapTokenRow = (row: Record<string, unknown>): D1TokenRow => ({
  id: Number(row.id),
  fcm_token: asString(row.fcm_token),
  token_type: asString(row.token_type),
  vapid_endpoint: asString(row.vapid_endpoint),
  vapid_p256dh: asString(row.vapid_p256dh),
  vapid_auth: asString(row.vapid_auth),
  status: asString(row.status),
  user_agent: asString(row.user_agent),
});

/** Full token row by id (processAutomationJob primary token lookup). */
export const d1GetTokenRowById = async (tokenId: number): Promise<D1TokenRow | null> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `SELECT id, fcm_token, token_type, vapid_endpoint, vapid_p256dh, vapid_auth, status, user_agent
     FROM subscriber_tokens WHERE id = ? LIMIT 1`,
    [tokenId],
  );
  const first = (rows as Array<Record<string, unknown>>)[0];
  return first ? mapTokenRow(first) : null;
};

const BEST_TARGETABLE_TOKEN_SELECT = `
  SELECT t.id, t.fcm_token, t.token_type, t.vapid_endpoint, t.vapid_p256dh, t.vapid_auth,
         t.status, t.user_agent
  FROM subscriber_tokens t
  __JOIN__
  WHERE t.shop_domain = ?
    AND __MATCH__
    AND t.status = 'active'
    AND (
      COALESCE(t.token_type, 'fcm') <> 'vapid'
      OR (
        COALESCE(t.vapid_endpoint, '') <> ''
        AND COALESCE(t.vapid_p256dh, '') <> ''
        AND COALESCE(t.vapid_auth, '') <> ''
      )
    )
  ORDER BY t.last_seen_at DESC, t.updated_at DESC
  LIMIT 1
`;

/** Best active, targetable token for a subscriber id (automation fallback). */
export const d1GetBestTargetableTokenBySubscriberId = async (
  shopDomain: string,
  subscriberId: number,
): Promise<D1TokenRow | null> => {
  await ensureD1AudienceSchema();
  const sql = BEST_TARGETABLE_TOKEN_SELECT.replace('__JOIN__', '').replace(
    '__MATCH__',
    't.subscriber_id = ?',
  );
  const rows = await runD1Query(sql, [shopDomain, subscriberId]);
  const first = (rows as Array<Record<string, unknown>>)[0];
  return first ? mapTokenRow(first) : null;
};

/** Best active, targetable token for a subscriber external_id (automation fallback). */
export const d1GetBestTargetableTokenByExternalId = async (
  shopDomain: string,
  externalId: string,
): Promise<D1TokenRow | null> => {
  await ensureD1AudienceSchema();
  const sql = BEST_TARGETABLE_TOKEN_SELECT.replace(
    '__JOIN__',
    'JOIN subscribers s ON s.id = t.subscriber_id',
  ).replace('__MATCH__', 's.external_id = ?');
  const rows = await runD1Query(sql, [shopDomain, externalId]);
  const first = (rows as Array<Record<string, unknown>>)[0];
  return first ? mapTokenRow(first) : null;
};

/** Map token ids -> fcm_token (job-processor / listDueAutomationJobs enrichment). */
export const d1GetFcmTokensByIds = async (ids: number[]): Promise<Map<number, string>> => {
  const out = new Map<number, string>();
  const clean = ids.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  if (clean.length === 0) {
    return out;
  }
  await ensureD1AudienceSchema();
  for (const part of chunk(clean, D1_MAX_IN)) {
    const placeholders = part.map(() => '?').join(', ');
    const rows = await runD1Query(
      `SELECT id, fcm_token FROM subscriber_tokens WHERE id IN (${placeholders})`,
      part,
    );
    for (const row of rows as Array<Record<string, unknown>>) {
      if (row.fcm_token != null) {
        out.set(Number(row.id), String(row.fcm_token));
      }
    }
  }
  return out;
};

export type D1ActiveTokenWithExternal = {
  tokenId: number;
  fcmToken: string | null;
  externalId: string;
};

/** Active tokens joined to their subscriber external_id (smart-delivery optimal hour). */
export const d1GetActiveTokensWithExternalId = async (
  shopDomain: string,
): Promise<D1ActiveTokenWithExternal[]> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `
      SELECT t.id AS token_id, t.fcm_token, s.external_id
      FROM subscriber_tokens t
      JOIN subscribers s ON s.id = t.subscriber_id
      WHERE t.shop_domain = ? AND t.status = 'active'
    `,
    [shopDomain],
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    tokenId: Number(row.token_id),
    fcmToken: asString(row.fcm_token),
    externalId: row.external_id == null ? '' : String(row.external_id),
  }));
};

export type D1NameValue = { name: string; value: number };

export const d1GetSubscriberBreakdown = async (
  shopDomain: string,
  limit: number,
): Promise<{ browsers: D1NameValue[]; platforms: D1NameValue[] }> => {
  await ensureD1AudienceSchema();
  const browsers = await runD1Query(
    `
      SELECT LOWER(COALESCE(NULLIF(browser, ''), NULLIF(json_extract(device_context, '$.browserName'), ''), 'unknown')) AS name,
             COUNT(*) AS value
      FROM subscribers WHERE shop_domain = ?
      GROUP BY 1 ORDER BY 2 DESC LIMIT ?
    `,
    [shopDomain, limit],
  );
  const platforms = await runD1Query(
    `
      SELECT LOWER(COALESCE(NULLIF(platform, ''), NULLIF(json_extract(device_context, '$.osName'), ''), 'unknown')) AS name,
             COUNT(*) AS value
      FROM subscribers WHERE shop_domain = ?
      GROUP BY 1 ORDER BY 2 DESC LIMIT ?
    `,
    [shopDomain, limit],
  );
  const map = (rows: unknown[]) =>
    (rows as Array<Record<string, unknown>>).map((row) => ({
      name: row.name == null ? 'unknown' : String(row.name),
      value: Number(row.value ?? 0),
    }));
  return { browsers: map(browsers), platforms: map(platforms) };
};

export const d1GetSubscriberLocationBreakdown = async (
  shopDomain: string,
  limit: number,
): Promise<{ countries: D1NameValue[]; cities: D1NameValue[] }> => {
  await ensureD1AudienceSchema();
  const countries = await runD1Query(
    `
      SELECT COALESCE(NULLIF(country, ''), 'Unknown') AS name, COUNT(*) AS value
      FROM subscribers WHERE shop_domain = ?
      GROUP BY 1 ORDER BY 2 DESC LIMIT ?
    `,
    [shopDomain, limit],
  );
  const cities = await runD1Query(
    `
      SELECT COALESCE(NULLIF(city, ''), 'Unknown') AS name, COUNT(*) AS value
      FROM subscribers WHERE shop_domain = ?
      GROUP BY 1 ORDER BY 2 DESC LIMIT ?
    `,
    [shopDomain, limit],
  );
  const map = (rows: unknown[]) =>
    (rows as Array<Record<string, unknown>>).map((row) => ({
      name: row.name == null ? 'Unknown' : String(row.name),
      value: Number(row.value ?? 0),
    }));
  return { countries: map(countries), cities: map(cities) };
};

/** COUNT(*) of subscribers created within [sinceIso, beforeIso]. */
export const d1CountSubscribersCreatedBetween = async (
  shopDomain: string,
  sinceIso: string,
  beforeIso: string,
): Promise<number> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `SELECT COUNT(*) AS count FROM subscribers WHERE shop_domain = ? AND created_at >= ? AND created_at <= ?`,
    [shopDomain, sinceIso, beforeIso],
  );
  return Number((rows as Array<Record<string, unknown>>)[0]?.count ?? 0);
};

export const d1GetEarliestSubscriberCreatedAt = async (
  shopDomain: string,
): Promise<string | null> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `SELECT MIN(created_at) AS earliest FROM subscribers WHERE shop_domain = ?`,
    [shopDomain],
  );
  const first = (rows as Array<Record<string, unknown>>)[0];
  return first && first.earliest != null ? String(first.earliest) : null;
};

export type D1DayCount = { day: string; count: number };

/** Per-UTC-day new-subscriber counts within [sinceIso, beforeIso] (growth chart). */
export const d1GetSubscriberGrowthCounts = async (
  shopDomain: string,
  sinceIso: string,
  beforeIso: string,
): Promise<D1DayCount[]> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `
      SELECT substr(s.created_at, 1, 10) AS day, COUNT(DISTINCT s.id) AS count
      FROM subscribers s
      JOIN subscriber_tokens t ON t.subscriber_id = s.id AND t.shop_domain = s.shop_domain
      WHERE s.shop_domain = ?
        AND s.created_at >= ?
        AND s.created_at <= ?
        AND ${DELIVERABLE_TOKEN_PREDICATE}
      GROUP BY day
    `,
    [shopDomain, sinceIso, beforeIso],
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    day: row.day == null ? '' : String(row.day),
    count: Number(row.count ?? 0),
  }));
};

export type D1ShopCount = { shop_domain: string; count: number };

/** Per-shop new-subscriber counts within [sinceIso, beforeIso] (daily rollup). */
export const d1CountNewSubscribersPerShop = async (
  sinceIso: string,
  beforeIso: string,
): Promise<D1ShopCount[]> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `
      SELECT shop_domain, COUNT(*) AS count
      FROM subscribers
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY shop_domain
    `,
    [sinceIso, beforeIso],
  );
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    shop_domain: String(row.shop_domain ?? ''),
    count: Number(row.count ?? 0),
  }));
};

/**
 * Of the given external_ids, those with at least one active token (mirrors the
 * `aliasRows` DISTINCT external_id + active-token join in resolveAutomationExternalIds).
 */
export const d1FilterExternalIdsWithActiveToken = async (
  shopDomain: string,
  externalIds: string[],
): Promise<string[]> => {
  const clean = Array.from(new Set(externalIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
  if (clean.length === 0) {
    return [];
  }
  await ensureD1AudienceSchema();
  const out = new Set<string>();
  for (const part of chunk(clean, D1_MAX_IN)) {
    const placeholders = part.map(() => '?').join(', ');
    const rows = await runD1Query(
      `
        SELECT DISTINCT s.external_id
        FROM subscribers s
        JOIN subscriber_tokens t ON t.subscriber_id = s.id
        WHERE s.shop_domain = ? AND t.shop_domain = ? AND t.status = 'active'
          AND s.external_id IN (${placeholders})
        LIMIT 100
      `,
      [shopDomain, shopDomain, ...part],
    );
    for (const row of rows as Array<Record<string, unknown>>) {
      if (row.external_id != null) {
        out.add(String(row.external_id));
      }
    }
  }
  return [...out];
};

/**
 * external_ids of subscribers (with an active token) whose device_context clientId
 * / shopifyAnalyticsClientId matches any of the given clientIds (identity fallback).
 */
export const d1ExternalIdsByClientIds = async (
  shopDomain: string,
  clientIds: string[],
): Promise<string[]> => {
  const clean = Array.from(new Set(clientIds.map((id) => String(id ?? '').trim()).filter(Boolean)));
  if (clean.length === 0) {
    return [];
  }
  await ensureD1AudienceSchema();
  const out = new Set<string>();
  for (const part of chunk(clean, Math.floor(D1_MAX_IN / 2))) {
    const placeholders = part.map(() => '?').join(', ');
    const rows = await runD1Query(
      `
        SELECT DISTINCT s.external_id
        FROM subscribers s
        JOIN subscriber_tokens t ON t.subscriber_id = s.id
        WHERE s.shop_domain = ? AND t.shop_domain = ? AND t.status = 'active'
          AND (
            COALESCE(json_extract(s.device_context, '$.clientId'), '') IN (${placeholders})
            OR COALESCE(json_extract(s.device_context, '$.shopifyAnalyticsClientId'), '') IN (${placeholders})
          )
        LIMIT 100
      `,
      [shopDomain, shopDomain, ...part, ...part],
    );
    for (const row of rows as Array<Record<string, unknown>>) {
      if (row.external_id != null) {
        out.add(String(row.external_id));
      }
    }
  }
  return [...out];
};

/** device_context clientId / shopifyAnalyticsClientId for a subscriber with an active token. */
export const d1GetSubscriberClientIds = async (
  shopDomain: string,
  externalId: string,
): Promise<{ clientId: string | null; shopifyAnalyticsClientId: string | null }> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `
      SELECT
        json_extract(s.device_context, '$.clientId') AS client_id,
        json_extract(s.device_context, '$.shopifyAnalyticsClientId') AS shopify_analytics_client_id
      FROM subscribers s
      JOIN subscriber_tokens t ON t.subscriber_id = s.id
      WHERE s.shop_domain = ? AND t.shop_domain = ? AND t.status = 'active'
        AND s.external_id = ?
        AND (
          COALESCE(json_extract(s.device_context, '$.clientId'), '') <> ''
          OR COALESCE(json_extract(s.device_context, '$.shopifyAnalyticsClientId'), '') <> ''
        )
      ORDER BY t.last_seen_at DESC, t.updated_at DESC
      LIMIT 1
    `,
    [shopDomain, shopDomain, externalId],
  );
  const first = (rows as Array<Record<string, unknown>>)[0];
  return {
    clientId: first?.client_id == null ? null : String(first.client_id),
    shopifyAnalyticsClientId:
      first?.shopify_analytics_client_id == null ? null : String(first.shopify_analytics_client_id),
  };
};

/** Global COUNT of active tokens (health/monitoring). */
export const d1CountActiveTokens = async (): Promise<number> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(`SELECT COUNT(*) AS count FROM subscriber_tokens WHERE status = 'active'`);
  return Number((rows as Array<Record<string, unknown>>)[0]?.count ?? 0);
};

export type D1GdprSubscriberRow = {
  id: number;
  external_id: string | null;
  browser: string | null;
  platform: string | null;
  locale: string | null;
  country: string | null;
  city: string | null;
  created_at: string | null;
  last_seen_at: string | null;
};

/**
 * Subscriber rows for a GDPR export/erasure: matched by external_id OR by being
 * referenced from the caller's Neon shopify_orders lookup (extraIds). The order
 * join stays on Neon; the caller passes the resulting subscriber ids here.
 */
export const d1GetGdprSubscriberRows = async (
  shopDomain: string,
  opts: { externalId?: string | null; extraIds?: number[] },
): Promise<D1GdprSubscriberRow[]> => {
  await ensureD1AudienceSchema();
  const extraIds = (opts.extraIds ?? []).map((id) => Number(id)).filter((id) => Number.isFinite(id));
  const externalId = opts.externalId ?? null;
  if (!externalId && extraIds.length === 0) {
    return [];
  }
  const out = new Map<number, D1GdprSubscriberRow>();
  const mapRow = (row: Record<string, unknown>): D1GdprSubscriberRow => ({
    id: Number(row.id),
    external_id: asString(row.external_id),
    browser: asString(row.browser),
    platform: asString(row.platform),
    locale: asString(row.locale),
    country: asString(row.country),
    city: asString(row.city),
    created_at: asString(row.created_at),
    last_seen_at: asString(row.last_seen_at),
  });
  const cols = `id, external_id, browser, platform, locale, country, city, created_at, last_seen_at`;
  if (externalId) {
    const rows = await runD1Query(
      `SELECT ${cols} FROM subscribers WHERE shop_domain = ? AND external_id = ?`,
      [shopDomain, externalId],
    );
    for (const row of rows as Array<Record<string, unknown>>) {
      out.set(Number(row.id), mapRow(row));
    }
  }
  for (const part of chunk(extraIds, D1_MAX_IN)) {
    const placeholders = part.map(() => '?').join(', ');
    const rows = await runD1Query(
      `SELECT ${cols} FROM subscribers WHERE shop_domain = ? AND id IN (${placeholders})`,
      [shopDomain, ...part],
    );
    for (const row of rows as Array<Record<string, unknown>>) {
      out.set(Number(row.id), mapRow(row));
    }
  }
  return [...out.values()];
};

// ---------------------------------------------------------------------------
// Authoritative writes (d1_only): D1 is the sole store and assigns ids. These
// throw on error (unlike the best-effort mirrors) because there is no Neon copy
// to fall back to — the caller's write must fail loudly so the client retries.
// ---------------------------------------------------------------------------

export type D1AuthoritativeUpsertInput = {
  shopDomain: string;
  externalId: string;
  browser: string | null;
  platform: string | null;
  locale: string | null;
  country: string | null;
  city: string | null;
  deviceContext: string | null;
  token: string;
  userAgent: string | null;
  tokenType: string;
  vapidEndpoint: string | null;
  vapidP256dh: string | null;
  vapidAuth: string | null;
};

/**
 * d1_only subscribe write: upsert the subscriber (D1 assigns the id) and the
 * token, returning the ids + whether the token row was newly inserted (drives
 * welcome-automation enqueue exactly like the Neon `xmax = 0` check).
 */
export const d1UpsertAudienceAuthoritative = async (
  input: D1AuthoritativeUpsertInput,
): Promise<{ subscriberId: number; tokenId: number; tokenWasInserted: boolean }> => {
  await ensureD1AudienceSchema();
  const now = nowIso();

  const subRows = await runD1Query(
    `
      INSERT INTO subscribers (
        shop_domain, external_id, browser, platform, locale, country, city,
        device_context, created_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_domain, external_id) DO UPDATE SET
        browser = excluded.browser,
        platform = excluded.platform,
        locale = excluded.locale,
        country = COALESCE(NULLIF(excluded.country, ''), subscribers.country),
        city = COALESCE(excluded.city, subscribers.city),
        device_context = COALESCE(excluded.device_context, subscribers.device_context),
        last_seen_at = excluded.last_seen_at
      RETURNING id
    `,
    [
      input.shopDomain,
      input.externalId,
      input.browser,
      input.platform,
      input.locale,
      input.country,
      input.city,
      input.deviceContext,
      now,
      now,
    ],
  );
  const subscriberId = Number((subRows as Array<Record<string, unknown>>)[0]?.id);
  if (!Number.isFinite(subscriberId)) {
    throw new Error('d1_only subscriber upsert returned no id.');
  }

  // Detect insert-vs-update before the upsert so welcome automations only fire on
  // a genuinely new token (SQLite has no xmax equivalent).
  const existing = await runD1Query(
    `SELECT id FROM subscriber_tokens WHERE shop_domain = ? AND fcm_token = ? LIMIT 1`,
    [input.shopDomain, input.token],
  );
  const tokenWasInserted = (existing as unknown[]).length === 0;

  const tokRows = await runD1Query(
    `
      INSERT INTO subscriber_tokens (
        shop_domain, subscriber_id, fcm_token, user_agent, status, token_type,
        vapid_endpoint, vapid_p256dh, vapid_auth, created_at, updated_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_domain, fcm_token) DO UPDATE SET
        subscriber_id = excluded.subscriber_id,
        user_agent = excluded.user_agent,
        token_type = excluded.token_type,
        vapid_endpoint = COALESCE(excluded.vapid_endpoint, subscriber_tokens.vapid_endpoint),
        vapid_p256dh = COALESCE(excluded.vapid_p256dh, subscriber_tokens.vapid_p256dh),
        vapid_auth = COALESCE(excluded.vapid_auth, subscriber_tokens.vapid_auth),
        status = 'active',
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at
      RETURNING id
    `,
    [
      input.shopDomain,
      subscriberId,
      input.token,
      input.userAgent,
      input.tokenType,
      input.vapidEndpoint,
      input.vapidP256dh,
      input.vapidAuth,
      now,
      now,
      now,
    ],
  );
  const tokenId = Number((tokRows as Array<Record<string, unknown>>)[0]?.id);
  if (!Number.isFinite(tokenId)) {
    throw new Error('d1_only token upsert returned no id.');
  }

  return { subscriberId, tokenId, tokenWasInserted };
};

/**
 * Isolated end-to-end proof that the d1_only authoritative write path works
 * against the live D1 audience database, without touching any real merchant's
 * data. Writes to a dedicated `__selftest__` shop, verifies the row is readable
 * with the ids D1 assigned, confirms idempotency (second write updates, does not
 * duplicate), then deletes the test rows. Run this before flipping D1_AUDIENCE_MODE
 * to d1_only.
 */
export const d1AudienceSelfTest = async (): Promise<{
  ok: boolean;
  steps: Array<{ step: string; ok: boolean; detail?: string }>;
}> => {
  const steps: Array<{ step: string; ok: boolean; detail?: string }> = [];
  const shopDomain = '__selftest__.myshopify.com';
  const marker = `__selftest__${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const baseInput = {
    shopDomain,
    externalId: marker,
    browser: 'selftest',
    platform: 'selftest',
    locale: 'en',
    country: 'US',
    city: 'Test',
    deviceContext: null,
    token: marker,
    userAgent: 'selftest',
    tokenType: 'fcm',
    vapidEndpoint: null,
    vapidP256dh: null,
    vapidAuth: null,
  } as const;
  let ok = true;

  try {
    await ensureD1AudienceSchema();

    const first = await d1UpsertAudienceAuthoritative({ ...baseInput });
    const firstOk =
      Number.isFinite(first.subscriberId) &&
      Number.isFinite(first.tokenId) &&
      first.subscriberId > 0 &&
      first.tokenId > 0 &&
      first.tokenWasInserted === true;
    steps.push({ step: 'insert', ok: firstOk, detail: JSON.stringify(first) });
    ok = ok && firstOk;

    const readRows = (await runD1Query(
      `SELECT s.id AS sub_id, s.browser AS browser, t.id AS tok_id, t.status AS status
       FROM subscribers s
       JOIN subscriber_tokens t ON t.subscriber_id = s.id AND t.shop_domain = s.shop_domain
       WHERE s.shop_domain = ? AND s.external_id = ?
       LIMIT 1`,
      [shopDomain, marker],
    )) as Array<Record<string, unknown>>;
    const readOk =
      readRows.length === 1 &&
      Number(readRows[0]?.sub_id) === first.subscriberId &&
      Number(readRows[0]?.tok_id) === first.tokenId &&
      readRows[0]?.status === 'active';
    steps.push({ step: 'readback', ok: readOk, detail: JSON.stringify(readRows) });
    ok = ok && readOk;

    const second = await d1UpsertAudienceAuthoritative({ ...baseInput });
    const secondOk =
      second.subscriberId === first.subscriberId &&
      second.tokenId === first.tokenId &&
      second.tokenWasInserted === false;
    steps.push({ step: 'idempotent-update', ok: secondOk, detail: JSON.stringify(second) });
    ok = ok && secondOk;
  } catch (error) {
    ok = false;
    steps.push({
      step: 'error',
      ok: false,
      detail: error instanceof Error ? error.message : String(error ?? ''),
    });
  } finally {
    try {
      await runD1Query(`DELETE FROM subscriber_tokens WHERE shop_domain = ?`, [shopDomain]);
      await runD1Query(`DELETE FROM subscribers WHERE shop_domain = ?`, [shopDomain]);
      steps.push({ step: 'cleanup', ok: true });
    } catch (error) {
      steps.push({
        step: 'cleanup',
        ok: false,
        detail: error instanceof Error ? error.message : String(error ?? ''),
      });
    }
  }

  return { ok, steps };
};

/**
 * d1_only iOS home-screen confirmation: mark the subscriber (creating a stub if
 * the confirm arrives before the first token, matching the Neon upsert).
 */
export const d1RecordIosHomeScreenConfirmedAuthoritative = async (input: {
  shopDomain: string;
  externalId: string;
  browser: string | null;
  platform: string | null;
  locale: string | null;
  country: string | null;
  city: string | null;
  deviceContext: string | null;
  confirmedAt: string;
  lastSeenAt: string;
}): Promise<{ subscriberId: number; confirmedAt: string | null; lastSeenAt: string | null }> => {
  await ensureD1AudienceSchema();
  const rows = await runD1Query(
    `
      INSERT INTO subscribers (
        shop_domain, external_id, browser, platform, locale, country, city, device_context,
        created_at, last_seen_at, ios_home_screen_confirmed_at, ios_home_screen_last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_domain, external_id) DO UPDATE SET
        browser = COALESCE(excluded.browser, subscribers.browser),
        platform = COALESCE(excluded.platform, subscribers.platform),
        locale = COALESCE(excluded.locale, subscribers.locale),
        country = COALESCE(excluded.country, subscribers.country),
        city = COALESCE(excluded.city, subscribers.city),
        device_context = COALESCE(excluded.device_context, subscribers.device_context),
        ios_home_screen_confirmed_at = COALESCE(
          subscribers.ios_home_screen_confirmed_at, excluded.ios_home_screen_confirmed_at
        ),
        ios_home_screen_last_seen_at = excluded.ios_home_screen_last_seen_at,
        last_seen_at = excluded.last_seen_at
      RETURNING id, ios_home_screen_confirmed_at, ios_home_screen_last_seen_at
    `,
    [
      input.shopDomain,
      input.externalId,
      input.browser,
      input.platform,
      input.locale,
      input.country,
      input.city,
      input.deviceContext,
      input.lastSeenAt,
      input.lastSeenAt,
      input.confirmedAt,
      input.lastSeenAt,
    ],
  );
  const first = (rows as Array<Record<string, unknown>>)[0];
  return {
    subscriberId: Number(first?.id),
    confirmedAt: first?.ios_home_screen_confirmed_at == null ? null : String(first.ios_home_screen_confirmed_at),
    lastSeenAt: first?.ios_home_screen_last_seen_at == null ? null : String(first.ios_home_screen_last_seen_at),
  };
};
