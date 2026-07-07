import { env } from '@/lib/config/env';

/**
 * Cloudflare D1 backing store for high-volume delivery/click detail tables:
 * campaign_deliveries, campaign_clicks, automation_deliveries, automation_clicks.
 *
 * Lifetime merchant-visible stats stay on Neon (campaigns row + automation_rule_stats).
 * These detail rows are pruned at scale; D1 holds the hot path off Neon.
 *
 * automation_deliveries denormalizes step_key + cart_token at insert time so welcome/
 * cart dedup does not need a cross-DB join to automation_jobs (jobs stay on Neon).
 */
const getDeliveriesDatabaseId = () =>
  env.CLOUDFLARE_D1_DELIVERIES_DATABASE_ID.trim() || env.CLOUDFLARE_D1_DATABASE_ID.trim();

export const isD1DeliveriesEnabled = () =>
  env.D1_DELIVERIES_ENABLED
  && Boolean(env.CLOUDFLARE_ACCOUNT_ID.trim())
  && Boolean(env.CLOUDFLARE_API_TOKEN.trim())
  && Boolean(getDeliveriesDatabaseId());

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
  const databaseId = getDeliveriesDatabaseId();

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

const asRows = (rows: unknown[]) => rows as Array<Record<string, unknown>>;
const toIso = (value: unknown): string => {
  if (value == null) {
    return new Date().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

let schemaReady = false;

export const ensureD1DeliveriesSchema = async () => {
  if (schemaReady || !isD1DeliveriesEnabled()) {
    return;
  }

  await runD1Query(`
    CREATE TABLE IF NOT EXISTS campaign_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      shop_domain TEXT NOT NULL,
      subscriber_id INTEGER NOT NULL,
      token_id INTEGER NOT NULL,
      fcm_message_id TEXT,
      delivered_at TEXT NOT NULL,
      clicked_at TEXT,
      converted_at TEXT,
      order_id TEXT,
      revenue_cents INTEGER NOT NULL DEFAULT 0,
      external_id TEXT,
      user_agent TEXT,
      ip_address TEXT
    )
  `);
  await runD1Query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_d1_cd_campaign_subscriber
    ON campaign_deliveries(campaign_id, subscriber_id)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_cd_campaign ON campaign_deliveries(campaign_id)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_cd_shop_delivered
    ON campaign_deliveries(shop_domain, delivered_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_cd_shop_external
    ON campaign_deliveries(shop_domain, external_id, delivered_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_cd_shop_order
    ON campaign_deliveries(shop_domain, order_id)
  `);

  await runD1Query(`
    CREATE TABLE IF NOT EXISTS campaign_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      shop_domain TEXT NOT NULL,
      subscriber_id INTEGER,
      target_url TEXT NOT NULL,
      clicked_at TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      referrer TEXT,
      order_id TEXT,
      converted_at TEXT,
      revenue_cents INTEGER NOT NULL DEFAULT 0,
      external_id TEXT
    )
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_cc_campaign_time
    ON campaign_clicks(campaign_id, clicked_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_cc_shop_subscriber
    ON campaign_clicks(shop_domain, subscriber_id, clicked_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_cc_shop_external
    ON campaign_clicks(shop_domain, external_id, clicked_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_cc_shop_order
    ON campaign_clicks(shop_domain, order_id)
  `);

  await runD1Query(`
    CREATE TABLE IF NOT EXISTS automation_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_job_id TEXT,
      rule_key TEXT NOT NULL,
      shop_domain TEXT NOT NULL,
      subscriber_id INTEGER,
      token_id INTEGER,
      external_id TEXT,
      target_url TEXT,
      fcm_message_id TEXT,
      delivered_at TEXT NOT NULL,
      clicked_at TEXT,
      user_agent TEXT,
      ip_address TEXT,
      converted_at TEXT,
      order_id TEXT,
      revenue_cents INTEGER NOT NULL DEFAULT 0,
      step_key TEXT,
      cart_token TEXT
    )
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_ad_shop_rule_time
    ON automation_deliveries(shop_domain, rule_key, delivered_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_ad_shop_external
    ON automation_deliveries(shop_domain, external_id, delivered_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_ad_shop_subscriber
    ON automation_deliveries(shop_domain, subscriber_id, delivered_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_ad_shop_step
    ON automation_deliveries(shop_domain, rule_key, step_key, delivered_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_ad_shop_order
    ON automation_deliveries(shop_domain, order_id)
  `);

  await runD1Query(`
    CREATE TABLE IF NOT EXISTS automation_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_key TEXT NOT NULL,
      shop_domain TEXT NOT NULL,
      subscriber_id INTEGER,
      external_id TEXT,
      target_url TEXT NOT NULL,
      clicked_at TEXT NOT NULL,
      user_agent TEXT,
      ip_address TEXT,
      referrer TEXT,
      order_id TEXT,
      converted_at TEXT,
      revenue_cents INTEGER NOT NULL DEFAULT 0
    )
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_ac_shop_rule_time
    ON automation_clicks(shop_domain, rule_key, clicked_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_ac_shop_external
    ON automation_clicks(shop_domain, external_id, clicked_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_ac_shop_order
    ON automation_clicks(shop_domain, order_id)
  `);

  schemaReady = true;
};

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type D1AutomationDeliveryInsert = {
  id?: number | null;
  automationJobId?: string | null;
  ruleKey: string;
  shopDomain: string;
  subscriberId?: number | null;
  tokenId?: number | null;
  externalId?: string | null;
  targetUrl?: string | null;
  fcmMessageId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  deliveredAt?: string | Date | null;
  stepKey?: string | null;
  cartToken?: string | null;
};

export const d1InsertAutomationDelivery = async (input: D1AutomationDeliveryInsert) => {
  await ensureD1DeliveriesSchema();
  const deliveredAt = toIso(input.deliveredAt ?? new Date());

  if (input.id != null && Number.isFinite(input.id)) {
    await runD1Query(
      `
        INSERT OR IGNORE INTO automation_deliveries (
          id, automation_job_id, rule_key, shop_domain, subscriber_id, token_id,
          external_id, target_url, fcm_message_id, user_agent, ip_address,
          delivered_at, step_key, cart_token
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.id,
        input.automationJobId ?? null,
        input.ruleKey,
        input.shopDomain,
        input.subscriberId ?? null,
        input.tokenId ?? null,
        input.externalId ?? null,
        input.targetUrl ?? null,
        input.fcmMessageId ?? null,
        input.userAgent ?? null,
        input.ipAddress ?? null,
        deliveredAt,
        input.stepKey ?? null,
        input.cartToken ?? null,
      ],
    );
    return input.id;
  }

  const rows = await runD1Query(
    `
      INSERT INTO automation_deliveries (
        automation_job_id, rule_key, shop_domain, subscriber_id, token_id,
        external_id, target_url, fcm_message_id, user_agent, ip_address,
        delivered_at, step_key, cart_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `,
    [
      input.automationJobId ?? null,
      input.ruleKey,
      input.shopDomain,
      input.subscriberId ?? null,
      input.tokenId ?? null,
      input.externalId ?? null,
      input.targetUrl ?? null,
      input.fcmMessageId ?? null,
      input.userAgent ?? null,
      input.ipAddress ?? null,
      deliveredAt,
      input.stepKey ?? null,
      input.cartToken ?? null,
    ],
  );
  return Number(asRows(rows)[0]?.id ?? 0) || null;
};

export const d1InsertAutomationClick = async (input: {
  id?: number | null;
  ruleKey: string;
  shopDomain: string;
  subscriberId?: number | null;
  externalId?: string | null;
  targetUrl: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  referrer?: string | null;
  clickedAt?: string | Date | null;
}) => {
  await ensureD1DeliveriesSchema();
  const clickedAt = toIso(input.clickedAt ?? new Date());

  if (input.id != null && Number.isFinite(input.id)) {
    await runD1Query(
      `
        INSERT OR IGNORE INTO automation_clicks (
          id, rule_key, shop_domain, subscriber_id, external_id, target_url,
          user_agent, ip_address, referrer, clicked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.id,
        input.ruleKey,
        input.shopDomain,
        input.subscriberId ?? null,
        input.externalId ?? null,
        input.targetUrl,
        input.userAgent ?? null,
        input.ipAddress ?? null,
        input.referrer ?? null,
        clickedAt,
      ],
    );
    return input.id;
  }

  const rows = await runD1Query(
    `
      INSERT INTO automation_clicks (
        rule_key, shop_domain, subscriber_id, external_id, target_url,
        user_agent, ip_address, referrer, clicked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `,
    [
      input.ruleKey,
      input.shopDomain,
      input.subscriberId ?? null,
      input.externalId ?? null,
      input.targetUrl,
      input.userAgent ?? null,
      input.ipAddress ?? null,
      input.referrer ?? null,
      clickedAt,
    ],
  );
  return Number(asRows(rows)[0]?.id ?? 0) || null;
};

export type D1CampaignDeliveryInsert = {
  id?: number | null;
  campaignId: string;
  shopDomain: string;
  subscriberId: number;
  tokenId: number;
  externalId?: string | null;
  userAgent?: string | null;
  fcmMessageId?: string | null;
  deliveredAt?: string | Date | null;
};

export const d1InsertCampaignDelivery = async (input: D1CampaignDeliveryInsert) => {
  await ensureD1DeliveriesSchema();
  const deliveredAt = toIso(input.deliveredAt ?? new Date());

  if (input.id != null && Number.isFinite(input.id)) {
    await runD1Query(
      `
        INSERT OR IGNORE INTO campaign_deliveries (
          id, campaign_id, shop_domain, subscriber_id, token_id,
          external_id, user_agent, fcm_message_id, delivered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.id,
        input.campaignId,
        input.shopDomain,
        input.subscriberId,
        input.tokenId,
        input.externalId ?? null,
        input.userAgent ?? null,
        input.fcmMessageId ?? null,
        deliveredAt,
      ],
    );
    return input.id;
  }

  const rows = await runD1Query(
    `
      INSERT INTO campaign_deliveries (
        campaign_id, shop_domain, subscriber_id, token_id,
        external_id, user_agent, fcm_message_id, delivered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id, subscriber_id) DO NOTHING
      RETURNING id
    `,
    [
      input.campaignId,
      input.shopDomain,
      input.subscriberId,
      input.tokenId,
      input.externalId ?? null,
      input.userAgent ?? null,
      input.fcmMessageId ?? null,
      deliveredAt,
    ],
  );
  const id = asRows(rows)[0]?.id;
  return id == null ? null : Number(id);
};

export const d1ClaimCampaignDeliverySlots = async (
  rows: Array<{
    campaignId: string;
    shopDomain: string;
    subscriberId: number;
    tokenId: number;
    externalId?: string | null;
    userAgent?: string | null;
  }>,
) => {
  await ensureD1DeliveriesSchema();
  const claimed: Array<{ subscriberId: number; tokenId: number }> = [];
  const seen = new Set<number>();

  for (const row of rows) {
    if (seen.has(row.subscriberId)) {
      continue;
    }
    seen.add(row.subscriberId);
    const id = await d1InsertCampaignDelivery({
      campaignId: row.campaignId,
      shopDomain: row.shopDomain,
      subscriberId: row.subscriberId,
      tokenId: row.tokenId,
      externalId: row.externalId ?? null,
      userAgent: row.userAgent ?? null,
      fcmMessageId: null,
    });
    if (id != null) {
      claimed.push({ subscriberId: row.subscriberId, tokenId: row.tokenId });
    }
  }

  return claimed;
};

export const d1UpdateCampaignDeliveryMessageIds = async (
  campaignId: string,
  updates: Array<{ subscriberId: number; messageId: string | null }>,
) => {
  await ensureD1DeliveriesSchema();
  for (const update of updates) {
    await runD1Query(
      `
        UPDATE campaign_deliveries
        SET fcm_message_id = ?
        WHERE campaign_id = ? AND subscriber_id = ?
      `,
      [update.messageId, campaignId, update.subscriberId],
    );
  }
};

export const d1ReleaseCampaignDeliveryClaims = async (campaignId: string, subscriberIds: number[]) => {
  if (subscriberIds.length === 0) {
    return;
  }
  await ensureD1DeliveriesSchema();
  const placeholders = subscriberIds.map(() => '?').join(',');
  await runD1Query(
    `
      DELETE FROM campaign_deliveries
      WHERE campaign_id = ?
        AND subscriber_id IN (${placeholders})
        AND fcm_message_id IS NULL
    `,
    [campaignId, ...subscriberIds],
  );
};

export const d1InsertCampaignClick = async (input: {
  id?: number | null;
  campaignId: string;
  shopDomain: string;
  subscriberId?: number | null;
  externalId?: string | null;
  targetUrl: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  referrer?: string | null;
  clickedAt?: string | Date | null;
}) => {
  await ensureD1DeliveriesSchema();
  const clickedAt = toIso(input.clickedAt ?? new Date());

  if (input.id != null && Number.isFinite(input.id)) {
    await runD1Query(
      `
        INSERT OR IGNORE INTO campaign_clicks (
          id, campaign_id, shop_domain, subscriber_id, external_id, target_url,
          user_agent, ip_address, referrer, clicked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.id,
        input.campaignId,
        input.shopDomain,
        input.subscriberId ?? null,
        input.externalId ?? null,
        input.targetUrl,
        input.userAgent ?? null,
        input.ipAddress ?? null,
        input.referrer ?? null,
        clickedAt,
      ],
    );
    return input.id;
  }

  const rows = await runD1Query(
    `
      INSERT INTO campaign_clicks (
        campaign_id, shop_domain, subscriber_id, external_id, target_url,
        user_agent, ip_address, referrer, clicked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `,
    [
      input.campaignId,
      input.shopDomain,
      input.subscriberId ?? null,
      input.externalId ?? null,
      input.targetUrl,
      input.userAgent ?? null,
      input.ipAddress ?? null,
      input.referrer ?? null,
      clickedAt,
    ],
  );
  return Number(asRows(rows)[0]?.id ?? 0) || null;
};

// ---------------------------------------------------------------------------
// Reads / updates used by automations, attribution, billing, stats
// ---------------------------------------------------------------------------

export const d1FindAutomationDeliveryJobId = async (input: {
  shopDomain: string;
  ruleKey: string;
  stepKey: string;
  externalId?: string | null;
  subscriberId?: number | null;
  tokenId?: number | null;
  cartToken?: string | null;
}) => {
  await ensureD1DeliveriesSchema();
  const clauses: string[] = [
    'shop_domain = ?',
    'rule_key = ?',
    'step_key = ?',
  ];
  const params: unknown[] = [input.shopDomain, input.ruleKey, input.stepKey];

  const identityClauses: string[] = [];
  if (input.externalId) {
    identityClauses.push('external_id = ?');
    params.push(input.externalId);
  }
  if (input.cartToken) {
    identityClauses.push('cart_token = ?');
    params.push(input.cartToken);
  }
  if (input.subscriberId != null && Number.isFinite(input.subscriberId)) {
    identityClauses.push('subscriber_id = ?');
    params.push(input.subscriberId);
  }
  if (input.tokenId != null && Number.isFinite(input.tokenId) && input.tokenId > 0) {
    identityClauses.push('token_id = ?');
    params.push(input.tokenId);
  }

  if (identityClauses.length === 0) {
    return null;
  }

  clauses.push(`(${identityClauses.join(' OR ')})`);
  const rows = await runD1Query(
    `
      SELECT automation_job_id
      FROM automation_deliveries
      WHERE ${clauses.join(' AND ')}
      ORDER BY delivered_at DESC
      LIMIT 1
    `,
    params,
  );
  const jobId = asRows(rows)[0]?.automation_job_id;
  return jobId == null ? null : String(jobId);
};

export const d1FindAutomationDeliveryId = async (input: {
  shopDomain: string;
  ruleKey: string;
  stepKey: string;
  externalId?: string | null;
  subscriberId?: number | null;
}) => {
  await ensureD1DeliveriesSchema();
  let sql = `
    SELECT id FROM automation_deliveries
    WHERE shop_domain = ? AND rule_key = ? AND step_key = ?
  `;
  const params: unknown[] = [input.shopDomain, input.ruleKey, input.stepKey];

  if (input.externalId) {
    sql += ' AND external_id = ?';
    params.push(input.externalId);
  } else if (input.subscriberId != null) {
    sql += ' AND subscriber_id = ?';
    params.push(input.subscriberId);
  } else {
    return null;
  }

  sql += ' ORDER BY delivered_at DESC LIMIT 1';
  const rows = await runD1Query(sql, params);
  const id = asRows(rows)[0]?.id;
  return id == null ? null : Number(id);
};

export const d1MarkAutomationDeliveryClicked = async (input: {
  shopDomain: string;
  ruleKey: string;
  externalId?: string | null;
}) => {
  await ensureD1DeliveriesSchema();
  const clickedAt = new Date().toISOString();
  if (input.externalId) {
    const rows = await runD1Query(
      `
        SELECT id FROM automation_deliveries
        WHERE shop_domain = ? AND rule_key = ? AND external_id = ? AND clicked_at IS NULL
        ORDER BY delivered_at DESC LIMIT 1
      `,
      [input.shopDomain, input.ruleKey, input.externalId],
    );
    const id = asRows(rows)[0]?.id;
    if (id != null) {
      await runD1Query(`UPDATE automation_deliveries SET clicked_at = ? WHERE id = ?`, [
        clickedAt,
        id,
      ]);
    }
    return;
  }
};

export const d1MarkCampaignDeliveryClicked = async (input: {
  campaignId: string;
  shopDomain: string;
  externalId?: string | null;
  subscriberId?: number | null;
}) => {
  await ensureD1DeliveriesSchema();
  const clickedAt = new Date().toISOString();
  let rows: unknown[];

  if (input.externalId) {
    rows = await runD1Query(
      `
        SELECT id FROM campaign_deliveries
        WHERE campaign_id = ? AND shop_domain = ? AND external_id = ? AND clicked_at IS NULL
        ORDER BY delivered_at DESC LIMIT 1
      `,
      [input.campaignId, input.shopDomain, input.externalId],
    );
  } else if (input.subscriberId != null) {
    rows = await runD1Query(
      `
        SELECT id FROM campaign_deliveries
        WHERE campaign_id = ? AND shop_domain = ? AND subscriber_id = ? AND clicked_at IS NULL
        ORDER BY delivered_at DESC LIMIT 1
      `,
      [input.campaignId, input.shopDomain, input.subscriberId],
    );
  } else {
    return;
  }

  const id = asRows(rows)[0]?.id;
  if (id != null) {
    await runD1Query(`UPDATE campaign_deliveries SET clicked_at = ? WHERE id = ?`, [clickedAt, id]);
  }
};

export const d1GetDeliveredSubscriberIdsForCampaign = async (
  campaignId: string,
  requireMessageId = false,
) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    requireMessageId
      ? `
          SELECT DISTINCT subscriber_id
          FROM campaign_deliveries
          WHERE campaign_id = ? AND fcm_message_id IS NOT NULL
        `
      : `SELECT DISTINCT subscriber_id FROM campaign_deliveries WHERE campaign_id = ?`,
    [campaignId],
  );
  return asRows(rows)
    .map((row) => Number(row.subscriber_id))
    .filter((id) => Number.isFinite(id));
};

export const d1GetDeliveredTokenIdsForCampaign = async (campaignId: string) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `SELECT token_id FROM campaign_deliveries WHERE campaign_id = ?`,
    [campaignId],
  );
  return asRows(rows)
    .map((row) => Number(row.token_id))
    .filter((id) => Number.isFinite(id));
};

export const d1DeleteUnsentCampaignDeliveries = async (campaignId: string, shopDomain: string) => {
  await ensureD1DeliveriesSchema();
  await runD1Query(
    `
      DELETE FROM campaign_deliveries
      WHERE campaign_id = ? AND shop_domain = ? AND fcm_message_id IS NULL
    `,
    [campaignId, shopDomain],
  );
};

export const d1CountImpressionsForPeriod = async (
  shopDomain: string,
  periodStartIso: string,
  periodEndIso: string,
) => {
  await ensureD1DeliveriesSchema();
  const [campaignRows, autoRows] = await Promise.all([
    runD1Query(
      `
        SELECT COUNT(*) AS count FROM campaign_deliveries
        WHERE shop_domain = ? AND delivered_at >= ? AND delivered_at < ?
      `,
      [shopDomain, periodStartIso, periodEndIso],
    ),
    runD1Query(
      `
        SELECT COUNT(*) AS count FROM automation_deliveries
        WHERE shop_domain = ? AND delivered_at >= ? AND delivered_at < ?
      `,
      [shopDomain, periodStartIso, periodEndIso],
    ),
  ]);
  return (
    Number(asRows(campaignRows)[0]?.count ?? 0) + Number(asRows(autoRows)[0]?.count ?? 0)
  );
};

export const d1GetAutomationStatsByRule = async (
  shopDomain: string,
  fromIso?: string | null,
  toIsoBound?: string | null,
) => {
  await ensureD1DeliveriesSchema();
  const deliveryParams: unknown[] = [shopDomain];
  let deliveryWhere = 'shop_domain = ?';
  if (fromIso && toIsoBound) {
    deliveryWhere += ' AND delivered_at >= ? AND delivered_at <= ?';
    deliveryParams.push(fromIso, toIsoBound);
  }

  const clickParams: unknown[] = [shopDomain];
  let clickWhere = 'shop_domain = ?';
  if (fromIso && toIsoBound) {
    clickWhere += ' AND clicked_at >= ? AND clicked_at <= ?';
    clickParams.push(fromIso, toIsoBound);
  }

  const [deliveryRows, clickRows] = await Promise.all([
    runD1Query(
      `
        SELECT rule_key, COUNT(*) AS impressions, COALESCE(SUM(revenue_cents), 0) AS revenue_cents
        FROM automation_deliveries WHERE ${deliveryWhere} GROUP BY rule_key
      `,
      deliveryParams,
    ),
    runD1Query(
      `
        SELECT rule_key, COUNT(*) AS clicks, COALESCE(SUM(revenue_cents), 0) AS revenue_cents
        FROM automation_clicks WHERE ${clickWhere} GROUP BY rule_key
      `,
      clickParams,
    ),
  ]);

  return {
    deliveries: asRows(deliveryRows).map((row) => ({
      rule_key: String(row.rule_key),
      impressions: Number(row.impressions ?? 0),
      revenue_cents: Number(row.revenue_cents ?? 0),
    })),
    clicks: asRows(clickRows).map((row) => ({
      rule_key: String(row.rule_key),
      clicks: Number(row.clicks ?? 0),
      revenue_cents: Number(row.revenue_cents ?? 0),
    })),
  };
};

export const d1GetAutomationAggregateForAnalytics = async (
  shopDomain: string,
  startIso: string,
  endIso: string,
) => {
  await ensureD1DeliveriesSchema();
  const [deliveryRows, clickRows] = await Promise.all([
    runD1Query(
      `
        SELECT COUNT(*) AS impressions, COALESCE(SUM(revenue_cents), 0) AS revenue_cents
        FROM automation_deliveries
        WHERE shop_domain = ? AND delivered_at >= ? AND delivered_at <= ?
      `,
      [shopDomain, startIso, endIso],
    ),
    runD1Query(
      `
        SELECT COUNT(*) AS clicks, COALESCE(SUM(revenue_cents), 0) AS revenue_cents
        FROM automation_clicks
        WHERE shop_domain = ? AND clicked_at >= ? AND clicked_at <= ?
      `,
      [shopDomain, startIso, endIso],
    ),
  ]);
  return {
    impressions: Number(asRows(deliveryRows)[0]?.impressions ?? 0),
    deliveryRevenueCents: Number(asRows(deliveryRows)[0]?.revenue_cents ?? 0),
    clicks: Number(asRows(clickRows)[0]?.clicks ?? 0),
    clickRevenueCents: Number(asRows(clickRows)[0]?.revenue_cents ?? 0),
  };
};

export const d1GetTopAutomationRulesByRevenue = async (
  shopDomain: string,
  startIso: string,
  endIso: string,
  limit?: number,
) => {
  await ensureD1DeliveriesSchema();
  const sql = limit
    ? `
        SELECT rule_key, COUNT(*) AS impressions, COALESCE(SUM(revenue_cents), 0) AS revenue_cents
        FROM automation_deliveries
        WHERE shop_domain = ? AND delivered_at >= ? AND delivered_at <= ?
        GROUP BY rule_key
        ORDER BY revenue_cents DESC
        LIMIT ?
      `
    : `
        SELECT rule_key, COUNT(*) AS impressions, COALESCE(SUM(revenue_cents), 0) AS revenue_cents
        FROM automation_deliveries
        WHERE shop_domain = ? AND delivered_at >= ? AND delivered_at <= ?
        GROUP BY rule_key
      `;
  const params = limit
    ? [shopDomain, startIso, endIso, limit]
    : [shopDomain, startIso, endIso];
  const rows = await runD1Query(sql, params);
  return asRows(rows).map((row) => ({
    rule_key: String(row.rule_key),
    impressions: Number(row.impressions ?? 0),
    revenue_cents: Number(row.revenue_cents ?? 0),
  }));
};

export const d1GetAutomationClicksByRule = async (
  shopDomain: string,
  startIso: string,
  endIso: string,
) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT rule_key, COUNT(*) AS clicks
      FROM automation_clicks
      WHERE shop_domain = ? AND clicked_at >= ? AND clicked_at <= ?
      GROUP BY rule_key
    `,
    [shopDomain, startIso, endIso],
  );
  return asRows(rows).map((row) => ({
    rule_key: String(row.rule_key),
    clicks: Number(row.clicks ?? 0),
  }));
};

export const d1HasOrderAttribution = async (shopDomain: string, orderId: string) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT campaign_id FROM campaign_deliveries
      WHERE shop_domain = ? AND order_id = ?
      UNION ALL
      SELECT campaign_id FROM campaign_clicks
      WHERE shop_domain = ? AND order_id = ?
      LIMIT 1
    `,
    [shopDomain, orderId, shopDomain, orderId],
  );
  if (rows.length > 0) {
    return { type: 'campaign' as const, campaignId: String(asRows(rows)[0].campaign_id) };
  }

  const autoRows = await runD1Query(
    `
      SELECT id FROM automation_deliveries WHERE shop_domain = ? AND order_id = ?
      UNION ALL
      SELECT id FROM automation_clicks WHERE shop_domain = ? AND order_id = ?
      LIMIT 1
    `,
    [shopDomain, orderId, shopDomain, orderId],
  );
  if (autoRows.length > 0) {
    return { type: 'automation' as const };
  }
  return null;
};

export const d1FindCampaignTouches = async (input: {
  shopDomain: string;
  externalIds: string[];
  windowStartIso: string;
}) => {
  await ensureD1DeliveriesSchema();
  if (input.externalIds.length === 0) {
    return { clicks: [] as Array<Record<string, unknown>>, deliveries: [] as Array<Record<string, unknown>> };
  }
  const placeholders = input.externalIds.map(() => '?').join(',');
  const params = [input.shopDomain, input.windowStartIso, ...input.externalIds];

  const [clickRows, deliveryRows] = await Promise.all([
    runD1Query(
      `
        SELECT id, campaign_id, clicked_at
        FROM campaign_clicks
        WHERE shop_domain = ? AND clicked_at >= ? AND external_id IN (${placeholders})
        ORDER BY clicked_at DESC
      `,
      params,
    ),
    runD1Query(
      `
        SELECT id, campaign_id, delivered_at
        FROM campaign_deliveries
        WHERE shop_domain = ? AND delivered_at >= ? AND external_id IN (${placeholders})
        ORDER BY delivered_at DESC
      `,
      params,
    ),
  ]);

  return { clicks: asRows(clickRows), deliveries: asRows(deliveryRows) };
};

export const d1FindAutomationTouches = async (input: {
  shopDomain: string;
  externalIds: string[];
  windowStartIso: string;
}) => {
  await ensureD1DeliveriesSchema();
  if (input.externalIds.length === 0) {
    return { clicks: [] as Array<Record<string, unknown>>, deliveries: [] as Array<Record<string, unknown>> };
  }
  const placeholders = input.externalIds.map(() => '?').join(',');
  const params = [input.shopDomain, input.windowStartIso, ...input.externalIds];

  const [clickRows, deliveryRows] = await Promise.all([
    runD1Query(
      `
        SELECT id, rule_key, clicked_at
        FROM automation_clicks
        WHERE shop_domain = ? AND clicked_at >= ? AND external_id IN (${placeholders})
        ORDER BY clicked_at DESC
      `,
      params,
    ),
    runD1Query(
      `
        SELECT id, rule_key, delivered_at
        FROM automation_deliveries
        WHERE shop_domain = ? AND delivered_at >= ? AND external_id IN (${placeholders})
        ORDER BY delivered_at DESC
      `,
      params,
    ),
  ]);

  return { clicks: asRows(clickRows), deliveries: asRows(deliveryRows) };
};

export const d1FindAutomationFingerprintClicks = async (input: {
  shopDomain: string;
  windowStartIso: string;
  ruleKey?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  limit?: number;
}) => {
  await ensureD1DeliveriesSchema();
  const limit = input.limit ?? 20;
  const clauses = ['shop_domain = ?', 'clicked_at >= ?'];
  const params: unknown[] = [input.shopDomain, input.windowStartIso];

  if (input.ruleKey) {
    clauses.push('rule_key = ?');
    params.push(input.ruleKey);
  }
  if (input.ipAddress) {
    clauses.push('ip_address = ?');
    params.push(input.ipAddress);
  }
  if (input.userAgent) {
    clauses.push('user_agent = ?');
    params.push(input.userAgent);
  }

  const rows = await runD1Query(
    `
      SELECT id, rule_key, clicked_at
      FROM automation_clicks
      WHERE ${clauses.join(' AND ')}
      ORDER BY clicked_at DESC
      LIMIT ?
    `,
    [...params, limit],
  );
  return asRows(rows);
};

export const d1HasAutomationDeliveryForRuleExternal = async (input: {
  shopDomain: string;
  ruleKey: string;
  externalId: string;
}) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT id
      FROM automation_deliveries
      WHERE shop_domain = ? AND rule_key = ? AND external_id = ?
      LIMIT 1
    `,
    [input.shopDomain, input.ruleKey, input.externalId],
  );
  return asRows(rows).length > 0;
};

export const d1FindCampaignTouchesByCampaignId = async (input: {
  shopDomain: string;
  campaignId: string;
  windowStartIso: string;
  mode: 'click' | 'impression';
}) => {
  await ensureD1DeliveriesSchema();
  if (input.mode === 'click') {
    const rows = await runD1Query(
      `
        SELECT id, campaign_id, clicked_at
        FROM campaign_clicks
        WHERE shop_domain = ? AND campaign_id = ? AND clicked_at >= ?
        ORDER BY clicked_at DESC
        LIMIT 20
      `,
      [input.shopDomain, input.campaignId, input.windowStartIso],
    );
    return asRows(rows);
  }

  const rows = await runD1Query(
    `
      SELECT id, campaign_id, delivered_at
      FROM campaign_deliveries
      WHERE shop_domain = ? AND campaign_id = ? AND delivered_at >= ?
      ORDER BY delivered_at DESC
      LIMIT 20
    `,
    [input.shopDomain, input.campaignId, input.windowStartIso],
  );
  return asRows(rows);
};

export const d1FindCampaignFingerprintClicks = async (input: {
  shopDomain: string;
  windowStartIso: string;
  campaignId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  limit?: number;
}) => {
  await ensureD1DeliveriesSchema();
  const limit = input.limit ?? 20;
  const clauses = ['shop_domain = ?', 'clicked_at >= ?'];
  const params: unknown[] = [input.shopDomain, input.windowStartIso];

  if (input.campaignId) {
    clauses.push('campaign_id = ?');
    params.push(input.campaignId);
  }
  if (input.ipAddress) {
    clauses.push('ip_address = ?');
    params.push(input.ipAddress);
  }
  if (input.userAgent) {
    clauses.push('user_agent = ?');
    params.push(input.userAgent);
  }

  const rows = await runD1Query(
    `
      SELECT id, campaign_id, clicked_at
      FROM campaign_clicks
      WHERE ${clauses.join(' AND ')}
      ORDER BY clicked_at DESC
      LIMIT ?
    `,
    [...params, limit],
  );
  return asRows(rows);
};

export const d1FindCampaignFingerprintDeliveries = async (input: {
  shopDomain: string;
  windowStartIso: string;
  campaignId?: string | null;
  userAgent?: string | null;
  limit?: number;
}) => {
  await ensureD1DeliveriesSchema();
  if (!input.userAgent) {
    return [];
  }
  const limit = input.limit ?? 20;
  const clauses = ['shop_domain = ?', 'delivered_at >= ?', 'user_agent = ?'];
  const params: unknown[] = [input.shopDomain, input.windowStartIso, input.userAgent];
  if (input.campaignId) {
    clauses.push('campaign_id = ?');
    params.push(input.campaignId);
  }

  const rows = await runD1Query(
    `
      SELECT id, campaign_id, delivered_at
      FROM campaign_deliveries
      WHERE ${clauses.join(' AND ')}
      ORDER BY delivered_at DESC
      LIMIT ?
    `,
    [...params, limit],
  );
  return asRows(rows);
};

export const d1FindAutomationFingerprintDeliveries = async (input: {
  shopDomain: string;
  windowStartIso: string;
  ruleKey?: string | null;
  userAgent?: string | null;
  limit?: number;
}) => {
  await ensureD1DeliveriesSchema();
  if (!input.userAgent) {
    return [];
  }
  const limit = input.limit ?? 20;
  const clauses = ['shop_domain = ?', 'delivered_at >= ?', 'user_agent = ?'];
  const params: unknown[] = [input.shopDomain, input.windowStartIso, input.userAgent];
  if (input.ruleKey) {
    clauses.push('rule_key = ?');
    params.push(input.ruleKey);
  }

  const rows = await runD1Query(
    `
      SELECT id, rule_key, delivered_at
      FROM automation_deliveries
      WHERE ${clauses.join(' AND ')}
      ORDER BY delivered_at DESC
      LIMIT ?
    `,
    [...params, limit],
  );
  return asRows(rows);
};

export const d1UpdateTouchConversion = async (input: {
  table: 'campaign_clicks' | 'campaign_deliveries' | 'automation_clicks' | 'automation_deliveries';
  id: number;
  orderId: string;
  convertedAtIso: string;
  revenueCents: number;
}) => {
  await ensureD1DeliveriesSchema();
  const clickedOrDelivered =
    input.table === 'campaign_clicks' || input.table === 'automation_clicks'
      ? 'clicked_at'
      : 'delivered_at';

  const updated = await runD1Query(
    `
      UPDATE ${input.table}
      SET converted_at = ?, order_id = ?, revenue_cents = ?
      WHERE id = ? AND order_id IS NULL
      RETURNING id
    `,
    [input.convertedAtIso, input.orderId, input.revenueCents, input.id],
  );

  if (asRows(updated).length > 0) {
    return true;
  }

  // Mirror Neon fallback: clone row with conversion if already attributed on sibling field
  if (input.table === 'campaign_clicks') {
    const source = asRows(
      await runD1Query(`SELECT * FROM campaign_clicks WHERE id = ? LIMIT 1`, [input.id]),
    )[0];
    if (!source) {
      return false;
    }
    await runD1Query(
      `
        INSERT INTO campaign_clicks (
          campaign_id, shop_domain, subscriber_id, external_id, target_url,
          clicked_at, user_agent, ip_address, referrer, order_id, converted_at, revenue_cents
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        source.campaign_id,
        source.shop_domain,
        source.subscriber_id,
        source.external_id,
        source.target_url,
        source.clicked_at,
        source.user_agent,
        source.ip_address,
        source.referrer,
        input.orderId,
        input.convertedAtIso,
        input.revenueCents,
      ],
    );
    return true;
  }

  if (input.table === 'campaign_deliveries') {
    const source = asRows(
      await runD1Query(`SELECT * FROM campaign_deliveries WHERE id = ? LIMIT 1`, [input.id]),
    )[0];
    if (!source) {
      return false;
    }
    await runD1Query(
      `
        INSERT INTO campaign_deliveries (
          campaign_id, shop_domain, subscriber_id, token_id, external_id, user_agent,
          fcm_message_id, delivered_at, clicked_at, order_id, converted_at, revenue_cents
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        source.campaign_id,
        source.shop_domain,
        source.subscriber_id,
        source.token_id,
        source.external_id,
        source.user_agent,
        source.fcm_message_id,
        source.delivered_at,
        source.clicked_at,
        input.orderId,
        input.convertedAtIso,
        input.revenueCents,
      ],
    );
    return true;
  }

  if (input.table === 'automation_clicks') {
    const source = asRows(
      await runD1Query(`SELECT * FROM automation_clicks WHERE id = ? LIMIT 1`, [input.id]),
    )[0];
    if (!source) {
      return false;
    }
    await runD1Query(
      `
        INSERT INTO automation_clicks (
          rule_key, shop_domain, subscriber_id, external_id, target_url,
          clicked_at, user_agent, ip_address, referrer, order_id, converted_at, revenue_cents
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        source.rule_key,
        source.shop_domain,
        source.subscriber_id,
        source.external_id,
        source.target_url,
        source.clicked_at,
        source.user_agent,
        source.ip_address,
        source.referrer,
        input.orderId,
        input.convertedAtIso,
        input.revenueCents,
      ],
    );
    return true;
  }

  const source = asRows(
    await runD1Query(`SELECT * FROM automation_deliveries WHERE id = ? LIMIT 1`, [input.id]),
  )[0];
  if (!source) {
    return false;
  }
  await runD1Query(
    `
      INSERT INTO automation_deliveries (
        automation_job_id, rule_key, shop_domain, subscriber_id, token_id, external_id,
        target_url, fcm_message_id, delivered_at, clicked_at, user_agent, ip_address,
        order_id, converted_at, revenue_cents, step_key, cart_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      source.automation_job_id,
      source.rule_key,
      source.shop_domain,
      source.subscriber_id,
      source.token_id,
      source.external_id,
      source.target_url,
      source.fcm_message_id,
      source.delivered_at,
      source.clicked_at,
      source.user_agent,
      source.ip_address,
      input.orderId,
      input.convertedAtIso,
      input.revenueCents,
      source.step_key,
      source.cart_token,
    ],
  );
  return true;
};

export const d1GetWelcomeDeliveryStatsByStep = async (shopDomain: string) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT
        COALESCE(step_key, 'unknown') AS step_key,
        COUNT(*) AS delivered,
        MAX(delivered_at) AS last_delivered_at
      FROM automation_deliveries
      WHERE shop_domain = ?
        AND rule_key = 'welcome_subscriber'
        AND COALESCE(step_key, '') IN ('reminder-1', 'reminder-2', 'reminder-3')
      GROUP BY step_key
      ORDER BY step_key ASC
    `,
    [shopDomain],
  );
  return asRows(rows);
};

export const d1DeleteWelcomeAutomationData = async (shopDomain: string) => {
  await ensureD1DeliveriesSchema();
  const deliveryRows = await runD1Query(
    `
      DELETE FROM automation_deliveries
      WHERE shop_domain = ? AND rule_key = 'welcome_subscriber'
      RETURNING id
    `,
    [shopDomain],
  );
  const clickRows = await runD1Query(
    `
      DELETE FROM automation_clicks
      WHERE shop_domain = ? AND rule_key = 'welcome_subscriber'
      RETURNING id
    `,
    [shopDomain],
  );
  return { deliveries: deliveryRows.length, clicks: clickRows.length };
};

export type D1ClickStatRow = { subscriber_id: number; total: number; last_at: string | null };

/** Per-subscriber click count + last click time (segment "Clicked"). */
export const d1GetClickedSubscriberStats = async (
  shopDomain: string,
  externalIdToSubscriberId?: Map<string, number>,
): Promise<D1ClickStatRow[]> => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT subscriber_id, external_id, clicked_at
      FROM campaign_clicks
      WHERE shop_domain = ?
      UNION ALL
      SELECT subscriber_id, external_id, clicked_at
      FROM automation_clicks
      WHERE shop_domain = ?
    `,
    [shopDomain, shopDomain],
  );

  const stats = new Map<number, { total: number; last_at: string | null }>();

  for (const row of asRows(rows)) {
    let subscriberId =
      row.subscriber_id != null && Number.isFinite(Number(row.subscriber_id))
        ? Number(row.subscriber_id)
        : null;
    if (!subscriberId && row.external_id && externalIdToSubscriberId) {
      subscriberId = externalIdToSubscriberId.get(String(row.external_id)) ?? null;
    }
    if (!subscriberId || !Number.isFinite(subscriberId)) {
      continue;
    }

    const clickedAt = row.clicked_at == null ? null : String(row.clicked_at);
    const existing = stats.get(subscriberId);
    if (existing) {
      existing.total += 1;
      if (clickedAt && (!existing.last_at || clickedAt > existing.last_at)) {
        existing.last_at = clickedAt;
      }
    } else {
      stats.set(subscriberId, { total: 1, last_at: clickedAt });
    }
  }

  return Array.from(stats.entries()).map(([subscriber_id, { total, last_at }]) => ({
    subscriber_id,
    total,
    last_at,
  }));
};

export const d1GetCampaignClickTimes = async (
  shopDomain: string,
  subscriberId: number,
  sinceIso: string,
  limit = 100,
) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT clicked_at FROM campaign_clicks
      WHERE shop_domain = ? AND subscriber_id = ? AND clicked_at >= ?
      ORDER BY clicked_at DESC LIMIT ?
    `,
    [shopDomain, subscriberId, sinceIso, limit],
  );
  return asRows(rows);
};

export const d1GetCampaignDeliveryEngagement = async (
  shopDomain: string,
  subscriberId: number,
  sinceIso: string,
) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT
        COUNT(DISTINCT id) AS total_deliveries,
        COUNT(DISTINCT CASE WHEN clicked_at IS NOT NULL THEN id END) AS clicks,
        COUNT(DISTINCT CASE WHEN converted_at IS NOT NULL THEN id END) AS conversions
      FROM campaign_deliveries
      WHERE shop_domain = ? AND subscriber_id = ? AND delivered_at >= ?
    `,
    [shopDomain, subscriberId, sinceIso],
  );
  return asRows(rows)[0] ?? { total_deliveries: 0, clicks: 0, conversions: 0 };
};

export const d1GetCampaignSubscriberIds = async (campaignId: string) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT DISTINCT subscriber_id
      FROM campaign_deliveries
      WHERE campaign_id = ? AND subscriber_id IS NOT NULL
    `,
    [campaignId],
  );
  return asRows(rows)
    .map((row) => Number(row.subscriber_id))
    .filter((id) => Number.isFinite(id));
};

export const d1CancelCampaignDeliveries = async (campaignId: string) => {
  await ensureD1DeliveriesSchema();
  await runD1Query(
    `
      UPDATE campaign_deliveries
      SET delivered_at = NULL
      WHERE campaign_id = ? AND clicked_at IS NULL AND converted_at IS NULL
    `,
    [campaignId],
  );
};

// ---------------------------------------------------------------------------
// Prune + aggregates for automation_rule_stats fold
// ---------------------------------------------------------------------------

export const d1PruneCampaignDetail = async (deliveryCutoffIso: string) => {
  await ensureD1DeliveriesSchema();
  await runD1Query(`DELETE FROM campaign_deliveries WHERE delivered_at < ?`, [deliveryCutoffIso]);
  await runD1Query(`DELETE FROM campaign_clicks WHERE clicked_at < ?`, [deliveryCutoffIso]);
};

export type D1AutomationPruneAggregate = {
  shop_domain: string;
  rule_key: string;
  impressions: number;
  clicks: number;
  revenue_cents: number;
};

export const d1PruneAutomationDeliveriesWithAggregates = async (
  deliveryCutoffIso: string,
): Promise<D1AutomationPruneAggregate[]> => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT shop_domain, rule_key, COALESCE(SUM(revenue_cents), 0) AS revenue_cents, COUNT(*) AS impressions
      FROM automation_deliveries
      WHERE delivered_at < ?
      GROUP BY shop_domain, rule_key
    `,
    [deliveryCutoffIso],
  );
  await runD1Query(`DELETE FROM automation_deliveries WHERE delivered_at < ?`, [deliveryCutoffIso]);
  return asRows(rows).map((row) => ({
    shop_domain: String(row.shop_domain),
    rule_key: String(row.rule_key),
    impressions: Number(row.impressions ?? 0),
    clicks: 0,
    revenue_cents: Number(row.revenue_cents ?? 0),
  }));
};

export const d1PruneAutomationClicksWithAggregates = async (
  deliveryCutoffIso: string,
): Promise<D1AutomationPruneAggregate[]> => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT shop_domain, rule_key, COALESCE(SUM(revenue_cents), 0) AS revenue_cents, COUNT(*) AS clicks
      FROM automation_clicks
      WHERE clicked_at < ?
      GROUP BY shop_domain, rule_key
    `,
    [deliveryCutoffIso],
  );
  await runD1Query(`DELETE FROM automation_clicks WHERE clicked_at < ?`, [deliveryCutoffIso]);
  return asRows(rows).map((row) => ({
    shop_domain: String(row.shop_domain),
    rule_key: String(row.rule_key),
    impressions: 0,
    clicks: Number(row.clicks ?? 0),
    revenue_cents: Number(row.revenue_cents ?? 0),
  }));
};

export const d1RollupAutomationDeliveriesForDay = async (
  shopDomain: string,
  dayStartIso: string,
  dayEndIso: string,
) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT COUNT(*) AS impressions, COALESCE(SUM(revenue_cents), 0) AS revenue_cents
      FROM automation_deliveries
      WHERE shop_domain = ? AND delivered_at >= ? AND delivered_at <= ?
    `,
    [shopDomain, dayStartIso, dayEndIso],
  );
  return {
    impressions: Number(asRows(rows)[0]?.impressions ?? 0),
    revenue_cents: Number(asRows(rows)[0]?.revenue_cents ?? 0),
  };
};

export const d1RollupAutomationClicksForDay = async (
  shopDomain: string,
  dayStartIso: string,
  dayEndIso: string,
) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `
      SELECT COUNT(*) AS clicks, COALESCE(SUM(revenue_cents), 0) AS revenue_cents
      FROM automation_clicks
      WHERE shop_domain = ? AND clicked_at >= ? AND clicked_at <= ?
    `,
    [shopDomain, dayStartIso, dayEndIso],
  );
  return {
    clicks: Number(asRows(rows)[0]?.clicks ?? 0),
    revenue_cents: Number(asRows(rows)[0]?.revenue_cents ?? 0),
  };
};

// ---------------------------------------------------------------------------
// Counts (backfill / parity)
// ---------------------------------------------------------------------------

const countTable = async (table: string, shopDomain?: string): Promise<number> => {
  await ensureD1DeliveriesSchema();
  const rows = shopDomain
    ? await runD1Query(`SELECT COUNT(*) AS count FROM ${table} WHERE shop_domain = ?`, [shopDomain])
    : await runD1Query(`SELECT COUNT(*) AS count FROM ${table}`);
  return Number(asRows(rows)[0]?.count ?? 0);
};

export const d1CountSentCampaignDeliveries = async (campaignId: string) => {
  await ensureD1DeliveriesSchema();
  const rows = await runD1Query(
    `SELECT COUNT(*) AS count FROM campaign_deliveries WHERE campaign_id = ? AND fcm_message_id IS NOT NULL`,
    [campaignId],
  );
  return Number(asRows(rows)[0]?.count ?? 0);
};

export const d1CountCampaignDeliveriesForCampaign = async (
  campaignId: string,
  shopDomain?: string,
) => {
  await ensureD1DeliveriesSchema();
  const rows = shopDomain
    ? await runD1Query(
        `SELECT COUNT(*) AS count FROM campaign_deliveries WHERE campaign_id = ? AND shop_domain = ?`,
        [campaignId, shopDomain],
      )
    : await runD1Query(`SELECT COUNT(*) AS count FROM campaign_deliveries WHERE campaign_id = ?`, [
        campaignId,
      ]);
  return Number(asRows(rows)[0]?.count ?? 0);
};

export const d1CountCampaignDeliveries = (shopDomain?: string) =>
  countTable('campaign_deliveries', shopDomain);
export const d1CountCampaignClicks = (shopDomain?: string) =>
  countTable('campaign_clicks', shopDomain);
export const d1CountAutomationDeliveries = (shopDomain?: string) =>
  countTable('automation_deliveries', shopDomain);
export const d1CountAutomationClicks = (shopDomain?: string) =>
  countTable('automation_clicks', shopDomain);

/** Per-shop automation delivery/click totals for merchant_daily_stats rollup. */
export const d1GetAutomationDailyStatsPerShop = async (
  dayStartIso: string,
  dayEndIso: string,
): Promise<
  Array<{
    shop_domain: string;
    impressions: number;
    clicks: number;
    revenue_cents: number;
  }>
> => {
  if (!isD1DeliveriesEnabled()) {
    return [];
  }

  const [deliveryRows, clickRows] = await Promise.all([
    runD1Query(
      `SELECT shop_domain, COUNT(*) AS impressions, COALESCE(SUM(revenue_cents), 0) AS revenue_cents
       FROM automation_deliveries
       WHERE delivered_at >= ? AND delivered_at <= ?
       GROUP BY shop_domain`,
      [dayStartIso, dayEndIso],
    ),
    runD1Query(
      `SELECT shop_domain, COUNT(*) AS clicks, COALESCE(SUM(revenue_cents), 0) AS revenue_cents
       FROM automation_clicks
       WHERE clicked_at >= ? AND clicked_at <= ?
       GROUP BY shop_domain`,
      [dayStartIso, dayEndIso],
    ),
  ]);

  const byShop = new Map<
    string,
    { impressions: number; clicks: number; deliveryRevenue: number; clickRevenue: number }
  >();

  for (const row of asRows(deliveryRows)) {
    const shop = String(row.shop_domain ?? '');
    if (!shop) {
      continue;
    }
    const entry = byShop.get(shop) ?? {
      impressions: 0,
      clicks: 0,
      deliveryRevenue: 0,
      clickRevenue: 0,
    };
    entry.impressions = Number(row.impressions ?? 0);
    entry.deliveryRevenue = Number(row.revenue_cents ?? 0);
    byShop.set(shop, entry);
  }

  for (const row of asRows(clickRows)) {
    const shop = String(row.shop_domain ?? '');
    if (!shop) {
      continue;
    }
    const entry = byShop.get(shop) ?? {
      impressions: 0,
      clicks: 0,
      deliveryRevenue: 0,
      clickRevenue: 0,
    };
    entry.clicks = Number(row.clicks ?? 0);
    entry.clickRevenue = Number(row.revenue_cents ?? 0);
    byShop.set(shop, entry);
  }

  return [...byShop.entries()].map(([shop_domain, stats]) => ({
    shop_domain,
    impressions: stats.impressions,
    clicks: stats.clicks,
    revenue_cents: stats.deliveryRevenue + stats.clickRevenue,
  }));
};

export const d1DeliveriesSelfTest = async () => {
  if (!isD1DeliveriesEnabled()) {
    return { ok: false, reason: 'D1_DELIVERIES_ENABLED is off' as const };
  }

  const shopDomain = `__selftest__.${Date.now()}.myshopify.com`;
  const campaignId = `camp-${Date.now()}`;
  const steps: Record<string, boolean> = {};

  try {
    const deliveryId = await d1InsertCampaignDelivery({
      campaignId,
      shopDomain,
      subscriberId: 1001,
      tokenId: 2001,
      externalId: 'ext-selftest',
      fcmMessageId: 'msg-1',
    });
    steps.campaignDelivery = deliveryId != null;

    const clickId = await d1InsertCampaignClick({
      campaignId,
      shopDomain,
      subscriberId: 1001,
      externalId: 'ext-selftest',
      targetUrl: 'https://example.com',
    });
    steps.campaignClick = clickId != null;

    const autoDeliveryId = await d1InsertAutomationDelivery({
      automationJobId: 'job-1',
      ruleKey: 'welcome_subscriber',
      shopDomain,
      subscriberId: 1001,
      externalId: 'ext-selftest',
      stepKey: 'reminder-1',
      fcmMessageId: 'auto-msg',
    });
    steps.automationDelivery = autoDeliveryId != null;

    const jobId = await d1FindAutomationDeliveryJobId({
      shopDomain,
      ruleKey: 'welcome_subscriber',
      stepKey: 'reminder-1',
      externalId: 'ext-selftest',
    });
    steps.dedupRead = jobId === 'job-1';

    const billing = await d1CountImpressionsForPeriod(
      shopDomain,
      new Date(Date.now() - 3600_000).toISOString(),
      new Date(Date.now() + 3600_000).toISOString(),
    );
    steps.billing = billing >= 2;
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error ?? ''),
      steps,
    };
  } finally {
    try {
      await runD1Query(`DELETE FROM campaign_deliveries WHERE shop_domain = ?`, [shopDomain]);
      await runD1Query(`DELETE FROM campaign_clicks WHERE shop_domain = ?`, [shopDomain]);
      await runD1Query(`DELETE FROM automation_deliveries WHERE shop_domain = ?`, [shopDomain]);
      await runD1Query(`DELETE FROM automation_clicks WHERE shop_domain = ?`, [shopDomain]);
    } catch {
      // ignore
    }
  }

  const ok = Object.values(steps).every(Boolean) && Object.keys(steps).length >= 5;
  return { ok, steps };
};
