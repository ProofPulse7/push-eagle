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
 *   - read       : D1 becomes the source of truth for reads + writes (Stage 2).
 *
 * Ids are kept identical to Neon: in dual_write mode Neon assigns the BIGSERIAL
 * id and we mirror the row into D1 with that explicit id. That id parity is what
 * makes the eventual read cutover safe — every campaign_deliveries /
 * automation_deliveries row on Neon keeps referencing a valid audience id.
 */

export type D1AudienceMode = 'off' | 'dual_write' | 'read';

const hasD1Creds = () =>
  Boolean(env.CLOUDFLARE_ACCOUNT_ID.trim())
  && Boolean(env.CLOUDFLARE_API_TOKEN.trim())
  && Boolean(env.CLOUDFLARE_D1_DATABASE_ID.trim());

export const getD1AudienceMode = (): D1AudienceMode => {
  const mode = env.D1_AUDIENCE_MODE as D1AudienceMode;
  if ((mode === 'dual_write' || mode === 'read') && hasD1Creds()) {
    return mode;
  }
  return 'off';
};

/** True when writes should be mirrored into D1 (dual_write or read). */
export const isD1AudienceWriteEnabled = () => getD1AudienceMode() !== 'off';

/** True when D1 is the source of truth for reads (Stage 2 cutover). */
export const isD1AudienceReadEnabled = () => getD1AudienceMode() === 'read';

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
  const databaseId = env.CLOUDFLARE_D1_DATABASE_ID.trim();

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
    const placeholders = cleanIds.map(() => '?').join(', ');
    await runD1Query(
      `DELETE FROM subscriber_tokens WHERE shop_domain = ? AND subscriber_id IN (${placeholders})`,
      [shopDomain, ...cleanIds],
    );
    await runD1Query(
      `DELETE FROM subscribers WHERE shop_domain = ? AND id IN (${placeholders})`,
      [shopDomain, ...cleanIds],
    );
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
  const values = rows.map(() => `(${Array.from({ length: cols }, () => '?').join(', ')})`).join(', ');
  const params: unknown[] = [];
  for (const row of rows) {
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
  const values = rows.map(() => `(${Array.from({ length: cols }, () => '?').join(', ')})`).join(', ');
  const params: unknown[] = [];
  for (const row of rows) {
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
