import { env } from '@/lib/config/env';

/**
 * The database id used for raw events. Prefers the dedicated events DB so the
 * high-volume pixel/activity tables are isolated from the crown-jewel audience
 * (subscribers + subscriber_tokens) on the primary DB. Falls back to the
 * primary DB id so nothing breaks before the dedicated DB is provisioned.
 */
const getEventsDatabaseId = () =>
  env.CLOUDFLARE_D1_EVENTS_DATABASE_ID.trim() || env.CLOUDFLARE_D1_DATABASE_ID.trim();

export const isD1EventsEnabled = () =>
  env.D1_EVENTS_ENABLED
  && Boolean(env.CLOUDFLARE_ACCOUNT_ID.trim())
  && Boolean(env.CLOUDFLARE_API_TOKEN.trim())
  && Boolean(getEventsDatabaseId());

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
  const databaseId = getEventsDatabaseId();

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
    const message = payload.errors?.[0]?.message ?? `D1 query failed (${response.status}).`;
    throw new Error(message);
  }

  return payload.result?.[0]?.results ?? [];
};

let schemaReady = false;

export const ensureD1EventsSchema = async () => {
  if (schemaReady || !isD1EventsEnabled()) {
    return;
  }

  await runD1Query(`
    CREATE TABLE IF NOT EXISTS pixel_events (
      id TEXT PRIMARY KEY,
      shop_domain TEXT NOT NULL,
      external_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      page_url TEXT,
      product_id TEXT,
      cart_token TEXT,
      client_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_pixel_shop_cart
    ON pixel_events(shop_domain, cart_token, created_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_pixel_shop_client
    ON pixel_events(shop_domain, client_id, created_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_pixel_shop_created
    ON pixel_events(shop_domain, created_at)
  `);
  await runD1Query(`
    CREATE TABLE IF NOT EXISTS subscriber_activity_events (
      id TEXT PRIMARY KEY,
      shop_domain TEXT NOT NULL,
      external_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      page_url TEXT,
      product_id TEXT,
      cart_token TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_activity_shop_cart
    ON subscriber_activity_events(shop_domain, cart_token, created_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_activity_shop_created
    ON subscriber_activity_events(shop_domain, created_at)
  `);

  schemaReady = true;
};

export type TrackingRow = {
  external_id: string;
  created_at: string;
  client_id: string;
};

export const insertD1PixelEvent = async (input: {
  id: string;
  shopDomain: string;
  externalId: string;
  eventType: string;
  pageUrl?: string | null;
  productId?: string | null;
  cartToken?: string | null;
  clientId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}) => {
  await ensureD1EventsSchema();
  const createdAt = input.createdAt ?? new Date().toISOString();

  await runD1Query(
    `
      INSERT INTO pixel_events (
        id, shop_domain, external_id, event_type, page_url, product_id, cart_token, client_id, metadata, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.id,
      input.shopDomain,
      input.externalId,
      input.eventType,
      input.pageUrl ?? null,
      input.productId ?? null,
      input.cartToken ?? null,
      input.clientId ?? null,
      JSON.stringify(input.metadata ?? {}),
      createdAt,
    ],
  );

  return input.id;
};

export const insertD1ActivityEvent = async (input: {
  id: string;
  shopDomain: string;
  externalId: string;
  eventType: string;
  pageUrl?: string | null;
  productId?: string | null;
  cartToken?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}) => {
  await ensureD1EventsSchema();
  const createdAt = input.createdAt ?? new Date().toISOString();

  await runD1Query(
    `
      INSERT INTO subscriber_activity_events (
        id, shop_domain, external_id, event_type, page_url, product_id, cart_token, metadata, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.id,
      input.shopDomain,
      input.externalId,
      input.eventType,
      input.pageUrl ?? null,
      input.productId ?? null,
      input.cartToken ?? null,
      JSON.stringify(input.metadata ?? {}),
      createdAt,
    ],
  );

  return input.id;
};

const parseMetadataClientId = (metadataRaw: unknown) => {
  if (!metadataRaw) {
    return '';
  }

  try {
    const metadata = typeof metadataRaw === 'string' ? JSON.parse(metadataRaw) : metadataRaw;
    if (!metadata || typeof metadata !== 'object') {
      return '';
    }
    const record = metadata as Record<string, unknown>;
    return String(record.clientId ?? record.shopifyAnalyticsClientId ?? '').trim();
  } catch {
    return '';
  }
};

export const queryD1TrackingRowsForAutomation = async (input: {
  shopDomain: string;
  cartToken?: string | null;
  clientId?: string | null;
  windowStartIso: string;
}) => {
  await ensureD1EventsSchema();

  const rows: TrackingRow[] = [];
  const normalizedCartToken = input.cartToken?.trim() || null;
  const normalizedClientId = input.clientId?.trim() || null;

  if (normalizedCartToken) {
    const activityRows = await runD1Query(
      `
        SELECT external_id, created_at, metadata
        FROM subscriber_activity_events
        WHERE shop_domain = ?
          AND cart_token = ?
          AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [input.shopDomain, normalizedCartToken, input.windowStartIso],
    );
    const pixelRows = await runD1Query(
      `
        SELECT external_id, created_at, client_id
        FROM pixel_events
        WHERE shop_domain = ?
          AND cart_token = ?
          AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [input.shopDomain, normalizedCartToken, input.windowStartIso],
    );

    for (const row of activityRows as Array<Record<string, unknown>>) {
      rows.push({
        external_id: String(row.external_id ?? ''),
        created_at: String(row.created_at ?? ''),
        client_id: parseMetadataClientId(row.metadata),
      });
    }

    for (const row of pixelRows as Array<Record<string, unknown>>) {
      rows.push({
        external_id: String(row.external_id ?? ''),
        created_at: String(row.created_at ?? ''),
        client_id: String(row.client_id ?? '').trim(),
      });
    }

    const clientIds = Array.from(new Set(rows.map((row) => row.client_id).filter(Boolean)));
    if (clientIds.length > 0) {
      for (const clientId of clientIds) {
        const relatedActivity = await runD1Query(
          `
            SELECT external_id, created_at, metadata
            FROM subscriber_activity_events
            WHERE shop_domain = ?
              AND created_at >= ?
              AND metadata LIKE ?
            ORDER BY created_at DESC
            LIMIT 50
          `,
          [input.shopDomain, input.windowStartIso, `%${clientId}%`],
        );
        const relatedPixels = await runD1Query(
          `
            SELECT external_id, created_at, client_id
            FROM pixel_events
            WHERE shop_domain = ?
              AND client_id = ?
              AND created_at >= ?
            ORDER BY created_at DESC
            LIMIT 50
          `,
          [input.shopDomain, clientId, input.windowStartIso],
        );

        for (const row of relatedActivity as Array<Record<string, unknown>>) {
          rows.push({
            external_id: String(row.external_id ?? ''),
            created_at: String(row.created_at ?? ''),
            client_id: parseMetadataClientId(row.metadata),
          });
        }

        for (const row of relatedPixels as Array<Record<string, unknown>>) {
          rows.push({
            external_id: String(row.external_id ?? ''),
            created_at: String(row.created_at ?? ''),
            client_id: String(row.client_id ?? '').trim(),
          });
        }
      }
    }
  } else if (normalizedClientId) {
    const activityRows = await runD1Query(
      `
        SELECT external_id, created_at, metadata
        FROM subscriber_activity_events
        WHERE shop_domain = ?
          AND created_at >= ?
          AND metadata LIKE ?
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [input.shopDomain, input.windowStartIso, `%${normalizedClientId}%`],
    );
    const pixelRows = await runD1Query(
      `
        SELECT external_id, created_at, client_id
        FROM pixel_events
        WHERE shop_domain = ?
          AND client_id = ?
          AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT 100
      `,
      [input.shopDomain, normalizedClientId, input.windowStartIso],
    );

    for (const row of activityRows as Array<Record<string, unknown>>) {
      rows.push({
        external_id: String(row.external_id ?? ''),
        created_at: String(row.created_at ?? ''),
        client_id: parseMetadataClientId(row.metadata),
      });
    }

    for (const row of pixelRows as Array<Record<string, unknown>>) {
      rows.push({
        external_id: String(row.external_id ?? ''),
        created_at: String(row.created_at ?? ''),
        client_id: String(row.client_id ?? '').trim(),
      });
    }
  }

  const unique = new Map<string, TrackingRow>();
  for (const row of rows) {
    if (!row.external_id) {
      continue;
    }
    unique.set(`${row.external_id}:${row.created_at}`, row);
  }

  return Array.from(unique.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 100);
};

export const hasD1RecentSubscriberActivity = async (input: {
  shopDomain: string;
  externalId: string;
  sinceIso: string;
  eventTypes: string[];
  productId?: string | null;
  cartToken?: string | null;
}) => {
  if (!isD1EventsEnabled() || !input.externalId || input.eventTypes.length === 0) {
    return false;
  }

  await ensureD1EventsSchema();

  const eventPlaceholders = input.eventTypes.map(() => '?').join(', ');
  const params: unknown[] = [
    input.shopDomain,
    input.externalId,
    input.sinceIso,
    ...input.eventTypes,
  ];

  let identityClause = '';
  if (input.productId) {
    identityClause = 'AND product_id = ?';
    params.push(input.productId);
  } else if (input.cartToken) {
    identityClause = 'AND cart_token = ?';
    params.push(input.cartToken);
  }

  const rows = await runD1Query(
    `
      SELECT id
      FROM subscriber_activity_events
      WHERE shop_domain = ?
        AND external_id = ?
        AND created_at > ?
        AND event_type IN (${eventPlaceholders})
        ${identityClause}
      LIMIT 1
    `,
    params,
  );

  return (rows as unknown[]).length > 0;
};

export const hasD1CheckoutCompleteSince = async (input: {
  shopDomain: string;
  externalId?: string | null;
  cartToken?: string | null;
  sinceIso?: string | null;
}) => {
  if (!isD1EventsEnabled()) {
    return false;
  }

  const externalId = input.externalId?.trim() || null;
  const cartToken = input.cartToken?.trim() || null;
  if (!externalId && !cartToken) {
    return false;
  }

  await ensureD1EventsSchema();

  const sinceClause = input.sinceIso ? 'AND created_at >= ?' : '';
  const params: unknown[] = [input.shopDomain];
  if (input.sinceIso) {
    params.push(input.sinceIso);
  }

  if (externalId && cartToken) {
    params.push(externalId, cartToken);
    const rows = await runD1Query(
      `
        SELECT id
        FROM subscriber_activity_events
        WHERE shop_domain = ?
          AND event_type = 'checkout_complete'
          ${sinceClause}
          AND (external_id = ? OR cart_token = ?)
        LIMIT 1
      `,
      params,
    );
    return (rows as unknown[]).length > 0;
  }

  if (externalId) {
    params.push(externalId);
    const rows = await runD1Query(
      `
        SELECT id
        FROM subscriber_activity_events
        WHERE shop_domain = ?
          AND event_type = 'checkout_complete'
          ${sinceClause}
          AND external_id = ?
        LIMIT 1
      `,
      params,
    );
    return (rows as unknown[]).length > 0;
  }

  params.push(cartToken);
  const rows = await runD1Query(
    `
      SELECT id
      FROM subscriber_activity_events
      WHERE shop_domain = ?
        AND event_type = 'checkout_complete'
        ${sinceClause}
        AND cart_token = ?
      LIMIT 1
    `,
    params,
  );
  return (rows as unknown[]).length > 0;
};

export const pruneD1TrackingEvents = async (hotRetentionDays?: number, batchSize = 2000) => {
  if (!isD1EventsEnabled()) {
    return { pixelDeleted: 0, activityDeleted: 0 };
  }

  await ensureD1EventsSchema();
  // Default to the env-configured retention so the events DB can be shrunk
  // without a code change (kept >= the longest automation lookback upstream).
  const retentionDays = hotRetentionDays ?? env.D1_EVENTS_RETENTION_DAYS;
  const cutoffIso = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  await runD1Query(
    `
      DELETE FROM pixel_events
      WHERE id IN (
        SELECT id FROM pixel_events
        WHERE created_at < ?
        LIMIT ?
      )
    `,
    [cutoffIso, batchSize],
  );
  await runD1Query(
    `
      DELETE FROM subscriber_activity_events
      WHERE id IN (
        SELECT id FROM subscriber_activity_events
        WHERE created_at < ?
        LIMIT ?
      )
    `,
    [cutoffIso, batchSize],
  );

  return { pixelDeleted: batchSize, activityDeleted: batchSize };
};
