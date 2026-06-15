import { getNeonSql } from '@/lib/integrations/database/neon';
import { BASIC_PLAN, getBillingPeriodEnd, getBillingPeriodStart, type PlanKey } from '@/lib/server/billing/plans';
import { ensureMerchantAccount } from '@/lib/server/data/store';

export type MerchantBillingRecord = {
  shopDomain: string;
  planKey: PlanKey;
  tierId: string | null;
  impressionLimit: number;
  priceUsd: number;
  shopifySubscriptionId: string | null;
  status: string;
  periodStart: string;
  periodEnd: string;
  impressionsUsed: number;
  impressionsRemaining: number;
};

const ensureBillingSchema = async (shopDomain: string) => {
  await ensureMerchantAccount(shopDomain);
  const sql = getNeonSql();
  await sql`
    CREATE TABLE IF NOT EXISTS merchant_billing (
      shop_domain TEXT PRIMARY KEY REFERENCES merchants(shop_domain) ON DELETE CASCADE,
      plan_key TEXT NOT NULL DEFAULT 'basic',
      tier_id TEXT,
      impression_limit INTEGER NOT NULL DEFAULT 10000,
      price_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
      shopify_subscription_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      impressions_used INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE merchant_billing ADD COLUMN IF NOT EXISTS impressions_used INTEGER NOT NULL DEFAULT 0`;
};

export const countImpressionsForPeriod = async (
  shopDomain: string,
  periodStart: Date,
  periodEnd: Date,
) => {
  await ensureBillingSchema(shopDomain);
  const sql = getNeonSql();
  const rows = await sql`
    SELECT
      (
        SELECT COUNT(*)::BIGINT
        FROM campaign_deliveries
        WHERE shop_domain = ${shopDomain}
          AND delivered_at >= ${periodStart}
          AND delivered_at < ${periodEnd}
      ) +
      (
        SELECT COUNT(*)::BIGINT
        FROM automation_deliveries
        WHERE shop_domain = ${shopDomain}
          AND delivered_at >= ${periodStart}
          AND delivered_at < ${periodEnd}
      ) AS total
  `;
  return Number(rows[0]?.total ?? 0);
};

export const incrementBillingImpressions = async (shopDomain: string, delta: number) => {
  if (delta <= 0) {
    return;
  }
  await ensureBillingSchema(shopDomain);
  const sql = getNeonSql();
  const periodStart = getBillingPeriodStart();
  const periodEnd = getBillingPeriodEnd(periodStart);

  await sql`
    INSERT INTO merchant_billing (
      shop_domain,
      plan_key,
      impression_limit,
      price_usd,
      status,
      period_start,
      period_end,
      impressions_used
    )
    VALUES (
      ${shopDomain},
      ${BASIC_PLAN.key},
      ${BASIC_PLAN.impressions},
      ${BASIC_PLAN.priceUsd},
      'pending',
      ${periodStart},
      ${periodEnd},
      ${delta}
    )
    ON CONFLICT (shop_domain) DO UPDATE SET
      impressions_used = merchant_billing.impressions_used + ${delta},
      updated_at = NOW()
  `;
};

const mapBillingRow = (
  shopDomain: string,
  row: Record<string, unknown>,
  impressionsUsed: number,
): MerchantBillingRecord => {
  const impressionLimit = Number(row.impression_limit ?? BASIC_PLAN.impressions);
  return {
    shopDomain,
    planKey: String(row.plan_key) as PlanKey,
    tierId: row.tier_id ? String(row.tier_id) : null,
    impressionLimit,
    priceUsd: Number(row.price_usd ?? 0),
    shopifySubscriptionId: row.shopify_subscription_id ? String(row.shopify_subscription_id) : null,
    status: String(row.status ?? 'active'),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    impressionsUsed,
    impressionsRemaining: Math.max(0, impressionLimit - impressionsUsed),
  };
};

const syncPeriodIfNeeded = async (
  shopDomain: string,
  row: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const now = new Date();
  if (now < new Date(String(row.period_end))) {
    return row;
  }

  const sql = getNeonSql();
  const nextStart = getBillingPeriodStart(now);
  const nextEnd = getBillingPeriodEnd(nextStart);
  const updated = await sql`
    UPDATE merchant_billing
    SET
      period_start = ${nextStart},
      period_end = ${nextEnd},
      impressions_used = 0,
      updated_at = NOW()
    WHERE shop_domain = ${shopDomain}
    RETURNING *
  `;
  return (updated[0] as Record<string, unknown>) ?? row;
};

export const getMerchantBilling = async (
  shopDomain: string,
  options?: { reconcileUsage?: boolean },
): Promise<MerchantBillingRecord> => {
  await ensureBillingSchema(shopDomain);
  const sql = getNeonSql();
  const periodStart = getBillingPeriodStart();
  const periodEnd = getBillingPeriodEnd(periodStart);

  let rows = await sql`
    SELECT *
    FROM merchant_billing
    WHERE shop_domain = ${shopDomain}
    LIMIT 1
  `;

  if (!rows[0]) {
    await sql`
      INSERT INTO merchant_billing (
        shop_domain,
        plan_key,
        tier_id,
        impression_limit,
        price_usd,
        status,
        period_start,
        period_end,
        impressions_used
      )
      VALUES (
        ${shopDomain},
        ${BASIC_PLAN.key},
        NULL,
        ${BASIC_PLAN.impressions},
        ${BASIC_PLAN.priceUsd},
        'pending',
        ${periodStart},
        ${periodEnd},
        0
      )
      ON CONFLICT (shop_domain) DO NOTHING
    `;
    rows = await sql`
      SELECT *
      FROM merchant_billing
      WHERE shop_domain = ${shopDomain}
      LIMIT 1
    `;
  }

  let row = rows[0] as Record<string, unknown>;
  row = await syncPeriodIfNeeded(shopDomain, row);

  let impressionsUsed = Number(row.impressions_used ?? 0);
  if (options?.reconcileUsage) {
    impressionsUsed = await countImpressionsForPeriod(
      shopDomain,
      new Date(String(row.period_start)),
      new Date(String(row.period_end)),
    );
    await sql`
      UPDATE merchant_billing
      SET impressions_used = ${impressionsUsed}, updated_at = NOW()
      WHERE shop_domain = ${shopDomain}
    `;
  }

  return mapBillingRow(shopDomain, row, impressionsUsed);
};

export const getMerchantBillingFast = async (shopDomain: string) =>
  getMerchantBilling(shopDomain, { reconcileUsage: false });

export const markBillingCheckoutPending = async (input: {
  shopDomain: string;
  shopifySubscriptionId?: string | null;
}) => {
  await getMerchantBillingFast(input.shopDomain);
  const sql = getNeonSql();
  await sql`
    UPDATE merchant_billing
    SET
      shopify_subscription_id = COALESCE(${input.shopifySubscriptionId ?? null}, shopify_subscription_id),
      status = 'pending',
      updated_at = NOW()
    WHERE shop_domain = ${input.shopDomain}
  `;
};

export const clearBillingCheckoutPending = async (shopDomain: string) => {
  await ensureBillingSchema(shopDomain);
  const sql = getNeonSql();
  await sql`
    UPDATE merchant_billing
    SET status = 'active', updated_at = NOW()
    WHERE shop_domain = ${shopDomain} AND status = 'pending'
  `;
};

export const upsertMerchantBilling = async (input: {
  shopDomain: string;
  planKey: PlanKey;
  tierId?: string | null;
  impressionLimit: number;
  priceUsd: number;
  shopifySubscriptionId?: string | null;
  status?: string;
}) => {
  await ensureBillingSchema(input.shopDomain);
  const sql = getNeonSql();
  const periodStart = getBillingPeriodStart();
  const periodEnd = getBillingPeriodEnd(periodStart);

  const rows = await sql`
    INSERT INTO merchant_billing (
      shop_domain,
      plan_key,
      tier_id,
      impression_limit,
      price_usd,
      shopify_subscription_id,
      status,
      period_start,
      period_end,
      impressions_used,
      updated_at
    )
    VALUES (
      ${input.shopDomain},
      ${input.planKey},
      ${input.tierId ?? null},
      ${input.impressionLimit},
      ${input.priceUsd},
      ${input.shopifySubscriptionId ?? null},
      ${input.status ?? 'active'},
      ${periodStart},
      ${periodEnd},
      0,
      NOW()
    )
    ON CONFLICT (shop_domain) DO UPDATE SET
      plan_key = EXCLUDED.plan_key,
      tier_id = EXCLUDED.tier_id,
      impression_limit = EXCLUDED.impression_limit,
      price_usd = EXCLUDED.price_usd,
      shopify_subscription_id = COALESCE(EXCLUDED.shopify_subscription_id, merchant_billing.shopify_subscription_id),
      status = EXCLUDED.status,
      period_start = EXCLUDED.period_start,
      period_end = EXCLUDED.period_end,
      impressions_used = CASE
        WHEN merchant_billing.period_start IS DISTINCT FROM EXCLUDED.period_start THEN 0
        ELSE merchant_billing.impressions_used
      END,
      updated_at = NOW()
    RETURNING *
  `;

  const row = rows[0] as Record<string, unknown>;
  return mapBillingRow(input.shopDomain, row, Number(row.impressions_used ?? 0));
};

export const assertCanSendNotifications = async (shopDomain: string, requestedCount = 1) => {
  const billing = await getMerchantBilling(shopDomain, { reconcileUsage: true });
  if (billing.status !== 'active') {
    throw new Error(
      billing.status === 'pending'
        ? 'Approve your Push Eagle plan in Shopify to start sending notifications. Open Plans and click Subscribe.'
        : 'Your subscription is not active. Open Plans to subscribe again.',
    );
  }

  if (billing.impressionsRemaining < requestedCount) {
    throw new Error(
      `Monthly impression limit reached (${billing.impressionsUsed.toLocaleString()} / ${billing.impressionLimit.toLocaleString()}). Upgrade your plan to send more notifications.`,
    );
  }

  return billing;
};

export const isImpressionLimitReached = async (shopDomain: string) => {
  const billing = await getMerchantBillingFast(shopDomain);
  return billing.impressionsRemaining <= 0;
};
