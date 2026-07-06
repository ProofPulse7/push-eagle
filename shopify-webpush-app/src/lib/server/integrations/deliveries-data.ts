import { getNeonSql } from '@/lib/integrations/database/neon';
import {
  d1CancelCampaignDeliveries,
  d1ClaimCampaignDeliverySlots,
  d1CountAutomationClicks,
  d1CountAutomationDeliveries,
  d1CountCampaignClicks,
  d1CountCampaignDeliveries,
  d1CountImpressionsForPeriod,
  d1DeleteUnsentCampaignDeliveries,
  d1DeleteWelcomeAutomationData,
  d1FindAutomationDeliveryId,
  d1FindAutomationDeliveryJobId,
  d1FindAutomationFingerprintClicks,
  d1FindAutomationFingerprintDeliveries,
  d1FindAutomationTouches,
  d1FindCampaignFingerprintClicks,
  d1FindCampaignFingerprintDeliveries,
  d1FindCampaignTouches,
  d1FindCampaignTouchesByCampaignId,
  d1HasAutomationDeliveryForRuleExternal,
  d1GetAutomationAggregateForAnalytics,
  d1GetAutomationClicksByRule,
  d1GetAutomationStatsByRule,
  d1GetCampaignClickTimes,
  d1GetCampaignDeliveryEngagement,
  d1GetCampaignSubscriberIds,
  d1GetDeliveredSubscriberIdsForCampaign,
  d1GetDeliveredTokenIdsForCampaign,
  d1GetTopAutomationRulesByRevenue,
  d1GetWelcomeDeliveryStatsByStep,
  d1HasOrderAttribution,
  d1InsertAutomationClick,
  d1InsertAutomationDelivery,
  d1InsertCampaignClick,
  d1InsertCampaignDelivery,
  d1MarkAutomationDeliveryClicked,
  d1MarkCampaignDeliveryClicked,
  d1PruneAutomationClicksWithAggregates,
  d1PruneAutomationDeliveriesWithAggregates,
  d1PruneCampaignDetail,
  d1ReleaseCampaignDeliveryClaims,
  d1RollupAutomationClicksForDay,
  d1RollupAutomationDeliveriesForDay,
  d1UpdateCampaignDeliveryMessageIds,
  d1UpdateTouchConversion,
  isD1DeliveriesEnabled,
  type D1AutomationDeliveryInsert,
  type D1AutomationPruneAggregate,
  type D1CampaignDeliveryInsert,
} from '@/lib/server/integrations/d1-deliveries';

export {
  isD1DeliveriesEnabled,
  d1CountCampaignDeliveries,
  d1CountCampaignClicks,
  d1CountAutomationDeliveries,
  d1CountAutomationClicks,
  type D1AutomationPruneAggregate,
};

const neonSql = () => getNeonSql();

export const extractAutomationDeliveryMeta = (payload: Record<string, unknown> | null | undefined) => {
  const metadata = (payload?.metadata ?? {}) as Record<string, unknown>;
  const stepKey = metadata.stepKey == null ? null : String(metadata.stepKey);
  const cartToken = payload?.cartToken == null ? null : String(payload.cartToken);
  return { stepKey: stepKey || null, cartToken: cartToken || null };
};

// ---------------------------------------------------------------------------
// Automation delivery dedup (welcome / cart) â€” Neon join vs D1 step_key
// ---------------------------------------------------------------------------

export const findAutomationDeliveryJobIdJoined = async (input: {
  shopDomain: string;
  ruleKey: string;
  stepKey: string;
  externalId?: string | null;
  subscriberId?: number | null;
  tokenId?: number | null;
  cartToken?: string | null;
}): Promise<string | null> => {
  if (isD1DeliveriesEnabled()) {
    return d1FindAutomationDeliveryJobId(input);
  }

  const sql = neonSql();
  const hasExternal = Boolean(input.externalId);
  const hasCart = Boolean(input.cartToken);
  const hasSubscriber = input.subscriberId != null && Number.isFinite(input.subscriberId);
  const hasToken = input.tokenId != null && Number.isFinite(input.tokenId) && input.tokenId > 0;

  if (hasExternal && hasCart && hasSubscriber) {
    const rows = await sql`
      SELECT d.automation_job_id
      FROM automation_deliveries d
      JOIN automation_jobs j ON j.id = d.automation_job_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND d.rule_key = ${input.ruleKey}
        AND j.payload -> 'metadata' ->> 'stepKey' = ${input.stepKey}
        AND (
          d.external_id = ${input.externalId}
          OR j.payload ->> 'cartToken' = ${input.cartToken}
          OR d.subscriber_id = ${input.subscriberId}
        )
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `;
    return rows[0]?.automation_job_id == null ? null : String(rows[0].automation_job_id);
  }

  if (hasExternal && hasCart) {
    const rows = await sql`
      SELECT d.automation_job_id
      FROM automation_deliveries d
      JOIN automation_jobs j ON j.id = d.automation_job_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND d.rule_key = ${input.ruleKey}
        AND j.payload -> 'metadata' ->> 'stepKey' = ${input.stepKey}
        AND (d.external_id = ${input.externalId} OR j.payload ->> 'cartToken' = ${input.cartToken})
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `;
    return rows[0]?.automation_job_id == null ? null : String(rows[0].automation_job_id);
  }

  if (hasExternal && hasSubscriber) {
    const rows = await sql`
      SELECT d.automation_job_id
      FROM automation_deliveries d
      JOIN automation_jobs j ON j.id = d.automation_job_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND d.rule_key = ${input.ruleKey}
        AND j.payload -> 'metadata' ->> 'stepKey' = ${input.stepKey}
        AND (d.external_id = ${input.externalId} OR d.subscriber_id = ${input.subscriberId})
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `;
    return rows[0]?.automation_job_id == null ? null : String(rows[0].automation_job_id);
  }

  if (hasCart && hasSubscriber) {
    const rows = await sql`
      SELECT d.automation_job_id
      FROM automation_deliveries d
      JOIN automation_jobs j ON j.id = d.automation_job_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND d.rule_key = ${input.ruleKey}
        AND j.payload -> 'metadata' ->> 'stepKey' = ${input.stepKey}
        AND (j.payload ->> 'cartToken' = ${input.cartToken} OR d.subscriber_id = ${input.subscriberId})
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `;
    return rows[0]?.automation_job_id == null ? null : String(rows[0].automation_job_id);
  }

  if (hasExternal) {
    const rows = await sql`
      SELECT d.automation_job_id
      FROM automation_deliveries d
      JOIN automation_jobs j ON j.id = d.automation_job_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND d.rule_key = ${input.ruleKey}
        AND j.payload -> 'metadata' ->> 'stepKey' = ${input.stepKey}
        AND d.external_id = ${input.externalId}
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `;
    return rows[0]?.automation_job_id == null ? null : String(rows[0].automation_job_id);
  }

  if (hasCart) {
    const rows = await sql`
      SELECT d.automation_job_id
      FROM automation_deliveries d
      JOIN automation_jobs j ON j.id = d.automation_job_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND d.rule_key = ${input.ruleKey}
        AND j.payload -> 'metadata' ->> 'stepKey' = ${input.stepKey}
        AND j.payload ->> 'cartToken' = ${input.cartToken}
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `;
    return rows[0]?.automation_job_id == null ? null : String(rows[0].automation_job_id);
  }

  if (hasSubscriber) {
    const rows = await sql`
      SELECT d.automation_job_id
      FROM automation_deliveries d
      JOIN automation_jobs j ON j.id = d.automation_job_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND d.rule_key = ${input.ruleKey}
        AND j.payload -> 'metadata' ->> 'stepKey' = ${input.stepKey}
        AND d.subscriber_id = ${input.subscriberId}
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `;
    return rows[0]?.automation_job_id == null ? null : String(rows[0].automation_job_id);
  }

  if (hasToken) {
    const rows = await sql`
      SELECT d.automation_job_id
      FROM automation_deliveries d
      JOIN automation_jobs j ON j.id = d.automation_job_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND d.rule_key = ${input.ruleKey}
        AND j.payload -> 'metadata' ->> 'stepKey' = ${input.stepKey}
        AND d.token_id = ${input.tokenId}
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `;
    return rows[0]?.automation_job_id == null ? null : String(rows[0].automation_job_id);
  }

  return null;
};

export const findAutomationDeliveryIdForPreviousStep = async (input: {
  shopDomain: string;
  ruleKey: string;
  stepKey: string;
  externalId?: string | null;
  subscriberId?: number | null;
}): Promise<number | null> => {
  if (isD1DeliveriesEnabled()) {
    return d1FindAutomationDeliveryId(input);
  }

  const sql = neonSql();
  if (input.externalId) {
    const rows = await sql`
      SELECT d.id
      FROM automation_deliveries d
      JOIN automation_jobs j ON j.id = d.automation_job_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND d.rule_key = ${input.ruleKey}
        AND d.external_id = ${input.externalId}
        AND j.payload -> 'metadata' ->> 'stepKey' = ${input.stepKey}
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `;
    return rows[0]?.id == null ? null : Number(rows[0].id);
  }

  if (input.subscriberId != null) {
    const rows = await sql`
      SELECT d.id
      FROM automation_deliveries d
      JOIN automation_jobs j ON j.id = d.automation_job_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND d.rule_key = ${input.ruleKey}
        AND d.subscriber_id = ${input.subscriberId}
        AND j.payload -> 'metadata' ->> 'stepKey' = ${input.stepKey}
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `;
    return rows[0]?.id == null ? null : Number(rows[0].id);
  }

  return null;
};

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const insertAutomationDelivery = async (input: D1AutomationDeliveryInsert) => {
  if (isD1DeliveriesEnabled()) {
    return d1InsertAutomationDelivery(input);
  }

  const sql = neonSql();
  await sql`
    INSERT INTO automation_deliveries (
      automation_job_id, rule_key, shop_domain, subscriber_id, token_id,
      external_id, target_url, fcm_message_id, user_agent, ip_address
    )
    VALUES (
      ${input.automationJobId ?? null},
      ${input.ruleKey},
      ${input.shopDomain},
      ${input.subscriberId ?? null},
      ${input.tokenId ?? null},
      ${input.externalId ?? null},
      ${input.targetUrl ?? null},
      ${input.fcmMessageId ?? null},
      ${input.userAgent ?? null},
      ${input.ipAddress ?? null}
    )
  `;
  return null;
};

export const insertAutomationClick = async (input: Parameters<typeof d1InsertAutomationClick>[0]) => {
  if (isD1DeliveriesEnabled()) {
    return d1InsertAutomationClick(input);
  }

  const sql = neonSql();
  await sql`
    INSERT INTO automation_clicks (
      rule_key, shop_domain, subscriber_id, external_id, target_url,
      user_agent, ip_address, referrer
    )
    VALUES (
      ${input.ruleKey},
      ${input.shopDomain},
      ${input.subscriberId ?? null},
      ${input.externalId ?? null},
      ${input.targetUrl},
      ${input.userAgent ?? null},
      ${input.ipAddress ?? null},
      ${input.referrer ?? null}
    )
  `;
  return null;
};

export const insertCampaignClick = async (input: Parameters<typeof d1InsertCampaignClick>[0]) => {
  if (isD1DeliveriesEnabled()) {
    return d1InsertCampaignClick(input);
  }

  const sql = neonSql();
  await sql`
    INSERT INTO campaign_clicks (
      campaign_id, shop_domain, subscriber_id, external_id, target_url,
      user_agent, ip_address, referrer
    )
    VALUES (
      ${input.campaignId},
      ${input.shopDomain},
      ${input.subscriberId ?? null},
      ${input.externalId ?? null},
      ${input.targetUrl},
      ${input.userAgent ?? null},
      ${input.ipAddress ?? null},
      ${input.referrer ?? null}
    )
  `;
  return null;
};

export const insertCampaignDelivery = async (input: D1CampaignDeliveryInsert) => {
  if (isD1DeliveriesEnabled()) {
    return d1InsertCampaignDelivery(input);
  }

  const sql = neonSql();
  await sql`
    INSERT INTO campaign_deliveries (
      campaign_id, shop_domain, subscriber_id, token_id, external_id, user_agent, fcm_message_id
    )
    VALUES (
      ${input.campaignId},
      ${input.shopDomain},
      ${input.subscriberId},
      ${input.tokenId},
      ${input.externalId ?? null},
      ${input.userAgent ?? null},
      ${input.fcmMessageId ?? null}
    )
    ON CONFLICT (campaign_id, subscriber_id) DO NOTHING
  `;
  return null;
};

export const claimCampaignDeliverySlots = async (
  rows: Array<{
    campaignId: string;
    shopDomain: string;
    subscriberId: number;
    tokenId: number;
    externalId?: string | null;
    userAgent?: string | null;
  }>,
) => {
  if (isD1DeliveriesEnabled()) {
    return d1ClaimCampaignDeliverySlots(rows);
  }

  const sql = neonSql();
  if (rows.length === 0) {
    return [];
  }

  const seenSubscribers = new Set<number>();
  const filteredRows = rows.filter((row) => {
    if (seenSubscribers.has(row.subscriberId)) {
      return false;
    }
    seenSubscribers.add(row.subscriberId);
    return true;
  });

  if (filteredRows.length === 0) {
    return [];
  }

  const claimedRows = await sql`
    INSERT INTO campaign_deliveries (campaign_id, shop_domain, subscriber_id, token_id, external_id, user_agent, fcm_message_id)
    SELECT u.campaign_id, u.shop_domain, u.subscriber_id, u.token_id, u.external_id, u.user_agent, NULL
    FROM UNNEST(
      ${filteredRows.map((r) => r.campaignId)}::text[],
      ${filteredRows.map((r) => r.shopDomain)}::text[],
      ${filteredRows.map((r) => r.subscriberId)}::bigint[],
      ${filteredRows.map((r) => r.tokenId)}::bigint[],
      ${filteredRows.map((r) => r.externalId ?? null)}::text[],
      ${filteredRows.map((r) => r.userAgent ?? null)}::text[]
    ) AS u(campaign_id, shop_domain, subscriber_id, token_id, external_id, user_agent)
    ON CONFLICT (campaign_id, subscriber_id) DO NOTHING
    RETURNING subscriber_id, token_id
  `;

  return claimedRows.map((row) => ({
    subscriberId: Number((row as { subscriber_id: unknown }).subscriber_id),
    tokenId: Number((row as { token_id: unknown }).token_id),
  }));
};

export const updateCampaignDeliveryMessageIds = async (
  campaignId: string,
  updates: Array<{ subscriberId: number; messageId: string | null }>,
) => {
  if (isD1DeliveriesEnabled()) {
    return d1UpdateCampaignDeliveryMessageIds(campaignId, updates);
  }

  const sql = neonSql();
  if (updates.length === 0) {
    return;
  }

  const subscriberIds = updates.map((row) => row.subscriberId);
  const messageIds = updates.map((row) => row.messageId);

  await sql`
    UPDATE campaign_deliveries AS cd
    SET fcm_message_id = u.fcm_message_id
    FROM UNNEST(
      ${subscriberIds}::bigint[],
      ${messageIds}::text[]
    ) AS u(subscriber_id, fcm_message_id)
    WHERE cd.campaign_id = ${campaignId}
      AND cd.subscriber_id = u.subscriber_id
  `;
};

export const releaseCampaignDeliveryClaims = async (campaignId: string, subscriberIds: number[]) => {
  if (isD1DeliveriesEnabled()) {
    return d1ReleaseCampaignDeliveryClaims(campaignId, subscriberIds);
  }

  const sql = neonSql();
  if (subscriberIds.length === 0) {
    return;
  }

  await sql`
    DELETE FROM campaign_deliveries
    WHERE campaign_id = ${campaignId}
      AND subscriber_id = ANY(${subscriberIds}::bigint[])
      AND fcm_message_id IS NULL
  `;
};

export const markCampaignDeliveryClicked = async (input: {
  campaignId: string;
  shopDomain: string;
  externalId?: string | null;
  subscriberId?: number | null;
}) => {
  if (isD1DeliveriesEnabled()) {
    return d1MarkCampaignDeliveryClicked(input);
  }

  const sql = neonSql();
  const normalizedExternalId = input.externalId?.trim() || null;

  await sql`
    UPDATE campaign_deliveries
    SET clicked_at = NOW()
    WHERE id = (
      SELECT id
      FROM campaign_deliveries
      WHERE campaign_id = ${input.campaignId}
        AND shop_domain = ${input.shopDomain}
        AND clicked_at IS NULL
        ${normalizedExternalId ? sql`AND external_id = ${normalizedExternalId}` : input.subscriberId ? sql`AND subscriber_id = ${input.subscriberId}` : sql``}
      ORDER BY delivered_at DESC
      LIMIT 1
    )
  `;
};

export const markAutomationDeliveryClicked = async (input: {
  shopDomain: string;
  ruleKey: string;
  externalId?: string | null;
}) => {
  if (isD1DeliveriesEnabled()) {
    return d1MarkAutomationDeliveryClicked(input);
  }

  const sql = neonSql();
  const normalizedExternalId = input.externalId?.trim() || null;

  await sql`
    UPDATE automation_deliveries
    SET clicked_at = NOW()
    WHERE id = (
      SELECT id
      FROM automation_deliveries
      WHERE shop_domain = ${input.shopDomain}
        AND rule_key = ${input.ruleKey}
        ${normalizedExternalId ? sql`AND external_id = ${normalizedExternalId}` : sql``}
        AND clicked_at IS NULL
      ORDER BY delivered_at DESC
      LIMIT 1
    )
  `;
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getDeliveredSubscriberIdsForCampaign = async (
  campaignId: string,
  requireMessageId = false,
) => {
  if (isD1DeliveriesEnabled()) {
    return d1GetDeliveredSubscriberIdsForCampaign(campaignId, requireMessageId);
  }

  const sql = neonSql();
  const rows = requireMessageId
    ? await sql`
        SELECT DISTINCT subscriber_id
        FROM campaign_deliveries
        WHERE campaign_id = ${campaignId}
          AND fcm_message_id IS NOT NULL
      `
    : await sql`
        SELECT DISTINCT subscriber_id
        FROM campaign_deliveries
        WHERE campaign_id = ${campaignId}
      `;
  return rows
    .map((row) => Number((row as { subscriber_id?: unknown }).subscriber_id))
    .filter((id) => Number.isFinite(id));
};

export const getDeliveredTokenIdsForCampaign = async (campaignId: string) => {
  if (isD1DeliveriesEnabled()) {
    return d1GetDeliveredTokenIdsForCampaign(campaignId);
  }

  const sql = neonSql();
  const rows = await sql`
    SELECT token_id FROM campaign_deliveries WHERE campaign_id = ${campaignId}
  `;
  return rows.map((row) => Number((row as { token_id?: unknown }).token_id)).filter((id) => Number.isFinite(id));
};

export const countSentCampaignDeliveries = async (campaignId: string) => {
  if (isD1DeliveriesEnabled()) {
    const { d1CountSentCampaignDeliveries } = await import('@/lib/server/integrations/d1-deliveries');
    return d1CountSentCampaignDeliveries(campaignId);
  }

  const sql = neonSql();
  const rows = await sql`
    SELECT COUNT(*)::INT AS count
    FROM campaign_deliveries
    WHERE campaign_id = ${campaignId}
      AND fcm_message_id IS NOT NULL
  `;
  return Number(rows[0]?.count ?? 0);
};

export const countCampaignDeliveries = async (campaignId: string, shopDomain?: string) => {
  if (isD1DeliveriesEnabled()) {
    const { d1CountCampaignDeliveriesForCampaign } = await import(
      '@/lib/server/integrations/d1-deliveries'
    );
    return d1CountCampaignDeliveriesForCampaign(campaignId, shopDomain);
  }

  const sql = neonSql();
  const rows = shopDomain
    ? await sql`
        SELECT COUNT(*)::INT AS count
        FROM campaign_deliveries
        WHERE campaign_id = ${campaignId} AND shop_domain = ${shopDomain}
      `
    : await sql`
        SELECT COUNT(*)::INT AS count FROM campaign_deliveries WHERE campaign_id = ${campaignId}
      `;
  return Number(rows[0]?.count ?? 0);
};

export const deleteUnsentCampaignDeliveries = async (campaignId: string, shopDomain: string) => {
  if (isD1DeliveriesEnabled()) {
    return d1DeleteUnsentCampaignDeliveries(campaignId, shopDomain);
  }

  const sql = neonSql();
  await sql`
    DELETE FROM campaign_deliveries
    WHERE campaign_id = ${campaignId}
      AND shop_domain = ${shopDomain}
      AND fcm_message_id IS NULL
  `;
};

export const countImpressionsForBillingPeriod = async (
  shopDomain: string,
  periodStart: Date,
  periodEnd: Date,
) => {
  if (isD1DeliveriesEnabled()) {
    return d1CountImpressionsForPeriod(
      shopDomain,
      periodStart.toISOString(),
      periodEnd.toISOString(),
    );
  }

  const sql = neonSql();
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

export const getAutomationStatsByRule = async (
  shopDomain: string,
  from?: Date | null,
  to?: Date | null,
) => {
  if (isD1DeliveriesEnabled()) {
    const stats = await d1GetAutomationStatsByRule(
      shopDomain,
      from && to ? from.toISOString() : null,
      from && to ? to.toISOString() : null,
    );
    return stats;
  }

  const sql = neonSql();
  const hasRange = Boolean(from && to);

  const [deliveryStats, clickStats] = await Promise.all([
    hasRange
      ? sql`
          SELECT rule_key, COUNT(*)::BIGINT AS impressions, COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
          FROM automation_deliveries
          WHERE shop_domain = ${shopDomain} AND delivered_at >= ${from} AND delivered_at <= ${to}
          GROUP BY rule_key
        `
      : sql`
          SELECT rule_key, COUNT(*)::BIGINT AS impressions, COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
          FROM automation_deliveries WHERE shop_domain = ${shopDomain} GROUP BY rule_key
        `,
    hasRange
      ? sql`
          SELECT rule_key, COUNT(*)::BIGINT AS clicks, COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
          FROM automation_clicks
          WHERE shop_domain = ${shopDomain} AND clicked_at >= ${from} AND clicked_at <= ${to}
          GROUP BY rule_key
        `
      : sql`
          SELECT rule_key, COUNT(*)::BIGINT AS clicks, COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
          FROM automation_clicks WHERE shop_domain = ${shopDomain} GROUP BY rule_key
        `,
  ]);

  return {
    deliveries: deliveryStats.map((row) => ({
      rule_key: String(row.rule_key),
      impressions: Number(row.impressions ?? 0),
      revenue_cents: Number(row.revenue_cents ?? 0),
    })),
    clicks: clickStats.map((row) => ({
      rule_key: String(row.rule_key),
      clicks: Number(row.clicks ?? 0),
      revenue_cents: Number(row.revenue_cents ?? 0),
    })),
  };
};

export const getAutomationAggregateForAnalytics = async (
  shopDomain: string,
  start: Date,
  end: Date,
) => {
  if (isD1DeliveriesEnabled()) {
    return d1GetAutomationAggregateForAnalytics(shopDomain, start.toISOString(), end.toISOString());
  }

  const sql = neonSql();
  const [autoDeliveryRows, autoClickRows] = await Promise.all([
    sql`
      SELECT COUNT(*)::BIGINT AS impressions, COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
      FROM automation_deliveries
      WHERE shop_domain = ${shopDomain} AND delivered_at >= ${start} AND delivered_at <= ${end}
    `,
    sql`
      SELECT COUNT(*)::BIGINT AS clicks, COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
      FROM automation_clicks
      WHERE shop_domain = ${shopDomain} AND clicked_at >= ${start} AND clicked_at <= ${end}
    `,
  ]);

  return {
    impressions: Number(autoDeliveryRows[0]?.impressions ?? 0),
    deliveryRevenueCents: Number(autoDeliveryRows[0]?.revenue_cents ?? 0),
    clicks: Number(autoClickRows[0]?.clicks ?? 0),
    clickRevenueCents: Number(autoClickRows[0]?.revenue_cents ?? 0),
  };
};

export const getTopAutomationRulesByRevenue = async (
  shopDomain: string,
  start: Date,
  end: Date,
  limit?: number,
) => {
  if (isD1DeliveriesEnabled()) {
    const rows = await d1GetTopAutomationRulesByRevenue(
      shopDomain,
      start.toISOString(),
      end.toISOString(),
      limit,
    );
    return rows.map((row) => ({
      rule_key: row.rule_key,
      impressions: row.impressions,
      revenue_cents: row.revenue_cents,
    }));
  }

  const sql = neonSql();
  const rows = limit
    ? await sql`
        SELECT rule_key, COUNT(*)::BIGINT AS impressions, COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
        FROM automation_deliveries
        WHERE shop_domain = ${shopDomain} AND delivered_at >= ${start} AND delivered_at <= ${end}
        GROUP BY rule_key
        ORDER BY revenue_cents DESC NULLS LAST
        LIMIT ${limit}
      `
    : await sql`
        SELECT rule_key, COUNT(*)::BIGINT AS impressions, COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
        FROM automation_deliveries
        WHERE shop_domain = ${shopDomain} AND delivered_at >= ${start} AND delivered_at <= ${end}
        GROUP BY rule_key
      `;
  return rows.map((row) => ({
    rule_key: String(row.rule_key),
    impressions: Number(row.impressions ?? 0),
    revenue_cents: Number(row.revenue_cents ?? 0),
  }));
};

export const getAutomationClicksByRule = async (shopDomain: string, start: Date, end: Date) => {
  if (isD1DeliveriesEnabled()) {
    return d1GetAutomationClicksByRule(shopDomain, start.toISOString(), end.toISOString());
  }

  const sql = neonSql();
  const rows = await sql`
    SELECT rule_key, COUNT(*)::BIGINT AS clicks
    FROM automation_clicks
    WHERE shop_domain = ${shopDomain} AND clicked_at >= ${start} AND clicked_at <= ${end}
    GROUP BY rule_key
  `;
  return rows.map((row) => ({
    rule_key: String(row.rule_key),
    clicks: Number(row.clicks ?? 0),
  }));
};

export const hasOrderAttribution = async (shopDomain: string, orderId: string) => {
  if (isD1DeliveriesEnabled()) {
    return d1HasOrderAttribution(shopDomain, orderId);
  }

  const sql = neonSql();
  const existingAttribution = await sql`
    SELECT campaign_id
    FROM campaign_deliveries
    WHERE shop_domain = ${shopDomain} AND order_id = ${orderId}
    UNION ALL
    SELECT campaign_id
    FROM campaign_clicks
    WHERE shop_domain = ${shopDomain} AND order_id = ${orderId}
    LIMIT 1
  `;
  if (existingAttribution[0]?.campaign_id) {
    return { type: 'campaign' as const, campaignId: String(existingAttribution[0].campaign_id) };
  }

  const existingAutomationAttribution = await sql`
    SELECT id
    FROM automation_deliveries
    WHERE shop_domain = ${shopDomain} AND order_id = ${orderId}
    UNION ALL
    SELECT id
    FROM automation_clicks
    WHERE shop_domain = ${shopDomain} AND order_id = ${orderId}
    LIMIT 1
  `;
  if (existingAutomationAttribution[0]?.id) {
    return { type: 'automation' as const };
  }
  return null;
};

export const updateTouchConversion = async (input: Parameters<typeof d1UpdateTouchConversion>[0]) => {
  if (isD1DeliveriesEnabled()) {
    return d1UpdateTouchConversion(input);
  }

  const sql = neonSql();
  const occurredAt = new Date(input.convertedAtIso);

  if (input.table === 'campaign_clicks') {
    const updatedRows = await sql`
      UPDATE campaign_clicks
      SET converted_at = ${occurredAt}, order_id = ${input.orderId}, revenue_cents = ${input.revenueCents}
      WHERE id = ${input.id} AND order_id IS NULL
      RETURNING id
    `;
    if (!updatedRows[0]?.id) {
      await sql`
        INSERT INTO campaign_clicks (
          campaign_id, shop_domain, subscriber_id, target_url, clicked_at,
          order_id, converted_at, revenue_cents, user_agent, ip_address, external_id, referrer
        )
        SELECT campaign_id, shop_domain, subscriber_id, target_url, clicked_at,
          ${input.orderId}, ${occurredAt}, ${input.revenueCents}, user_agent, ip_address, external_id, referrer
        FROM campaign_clicks WHERE id = ${input.id} LIMIT 1
      `;
    }
    return true;
  }

  if (input.table === 'campaign_deliveries') {
    const updatedRows = await sql`
      UPDATE campaign_deliveries
      SET converted_at = ${occurredAt}, order_id = ${input.orderId}, revenue_cents = ${input.revenueCents}
      WHERE id = ${input.id} AND order_id IS NULL
      RETURNING id
    `;
    if (!updatedRows[0]?.id) {
      await sql`
        INSERT INTO campaign_deliveries (
          campaign_id, shop_domain, subscriber_id, token_id, external_id, user_agent,
          fcm_message_id, delivered_at, clicked_at, order_id, converted_at, revenue_cents
        )
        SELECT campaign_id, shop_domain, subscriber_id, token_id, external_id, user_agent,
          fcm_message_id, delivered_at, clicked_at, ${input.orderId}, ${occurredAt}, ${input.revenueCents}
        FROM campaign_deliveries WHERE id = ${input.id} LIMIT 1
      `;
    }
    return true;
  }

  if (input.table === 'automation_clicks') {
    const updatedRows = await sql`
      UPDATE automation_clicks
      SET converted_at = ${occurredAt}, order_id = ${input.orderId}, revenue_cents = ${input.revenueCents}
      WHERE id = ${input.id} AND order_id IS NULL
      RETURNING id
    `;
    if (!updatedRows[0]?.id) {
      await sql`
        INSERT INTO automation_clicks (
          rule_key, shop_domain, subscriber_id, external_id, target_url, clicked_at,
          user_agent, ip_address, referrer, order_id, converted_at, revenue_cents
        )
        SELECT rule_key, shop_domain, subscriber_id, external_id, target_url, clicked_at,
          user_agent, ip_address, referrer, ${input.orderId}, ${occurredAt}, ${input.revenueCents}
        FROM automation_clicks WHERE id = ${input.id} LIMIT 1
      `;
    }
    return true;
  }

  const updatedRows = await sql`
    UPDATE automation_deliveries
    SET converted_at = ${occurredAt}, order_id = ${input.orderId}, revenue_cents = ${input.revenueCents}
    WHERE id = ${input.id} AND order_id IS NULL
    RETURNING id
  `;
  if (!updatedRows[0]?.id) {
    await sql`
      INSERT INTO automation_deliveries (
        automation_job_id, rule_key, shop_domain, subscriber_id, token_id, external_id,
        target_url, fcm_message_id, delivered_at, clicked_at, user_agent, ip_address,
        order_id, converted_at, revenue_cents
      )
      SELECT automation_job_id, rule_key, shop_domain, subscriber_id, token_id, external_id,
        target_url, fcm_message_id, delivered_at, clicked_at, user_agent, ip_address,
        ${input.orderId}, ${occurredAt}, ${input.revenueCents}
      FROM automation_deliveries WHERE id = ${input.id} LIMIT 1
    `;
  }
  return true;
};

export const getWelcomeDeliveryStatsByStep = async (shopDomain: string) => {
  if (isD1DeliveriesEnabled()) {
    return d1GetWelcomeDeliveryStatsByStep(shopDomain);
  }

  const sql = neonSql();
  const rows = await sql`
    SELECT
      COALESCE(j.payload -> 'metadata' ->> 'stepKey', 'unknown') AS step_key,
      COUNT(*)::INT AS delivered,
      MAX(d.delivered_at) AS last_delivered_at
    FROM automation_deliveries d
    JOIN automation_jobs j ON j.id = d.automation_job_id
    WHERE d.shop_domain = ${shopDomain}
      AND d.rule_key = 'welcome_subscriber'
      AND COALESCE(j.payload -> 'metadata' ->> 'stepKey', '') IN ('reminder-1', 'reminder-2', 'reminder-3')
    GROUP BY step_key
    ORDER BY step_key ASC
  `;
  return rows.map((row) => ({
    step_key: String(row.step_key),
    delivered: Number(row.delivered ?? 0),
    last_delivered_at: row.last_delivered_at == null ? null : String(row.last_delivered_at),
  }));
};

export const deleteWelcomeAutomationDeliveries = async (shopDomain: string) => {
  if (isD1DeliveriesEnabled()) {
    return d1DeleteWelcomeAutomationData(shopDomain);
  }

  const sql = neonSql();
  const deliveryRows = await sql`
    DELETE FROM automation_deliveries
    WHERE shop_domain = ${shopDomain} AND rule_key = 'welcome_subscriber'
    RETURNING id
  `;
  const clickRows = await sql`
    DELETE FROM automation_clicks
    WHERE shop_domain = ${shopDomain} AND rule_key = 'welcome_subscriber'
    RETURNING id
  `;
  return { deliveries: deliveryRows.length, clicks: clickRows.length };
};

export const getCampaignClickTimes = async (
  shopDomain: string,
  subscriberId: number,
  since: Date,
  limit = 100,
) => {
  if (isD1DeliveriesEnabled()) {
    return d1GetCampaignClickTimes(shopDomain, subscriberId, since.toISOString(), limit);
  }

  const sql = neonSql();
  return sql`
    SELECT clicked_at FROM campaign_clicks
    WHERE shop_domain = ${shopDomain} AND subscriber_id = ${subscriberId}
      AND clicked_at >= ${since}
    ORDER BY clicked_at DESC LIMIT ${limit}
  `;
};

export const getCampaignDeliveryEngagement = async (
  shopDomain: string,
  subscriberId: number,
  since: Date,
) => {
  if (isD1DeliveriesEnabled()) {
    return d1GetCampaignDeliveryEngagement(shopDomain, subscriberId, since.toISOString());
  }

  const sql = neonSql();
  const rows = await sql`
    SELECT
      COUNT(DISTINCT cd.id)::INT AS total_deliveries,
      COUNT(DISTINCT CASE WHEN cd.clicked_at IS NOT NULL THEN cd.id END)::INT AS clicks,
      COUNT(DISTINCT CASE WHEN cd.converted_at IS NOT NULL THEN cd.id END)::INT AS conversions
    FROM campaign_deliveries cd
    WHERE cd.shop_domain = ${shopDomain}
      AND cd.subscriber_id = ${subscriberId}
      AND cd.delivered_at >= ${since}
  `;
  return rows[0] ?? { total_deliveries: 0, clicks: 0, conversions: 0 };
};

export const getCampaignSubscriberIdsForTiming = async (campaignId: string) => {
  if (isD1DeliveriesEnabled()) {
    return d1GetCampaignSubscriberIds(campaignId);
  }

  const sql = neonSql();
  const rows = await sql`
    SELECT DISTINCT subscriber_id
    FROM campaign_deliveries
    WHERE campaign_id = ${campaignId} AND subscriber_id IS NOT NULL
  `;
  return rows.map((row) => Number(row.subscriber_id)).filter((id) => Number.isFinite(id));
};

export const cancelCampaignDeliveries = async (campaignId: string) => {
  if (isD1DeliveriesEnabled()) {
    return d1CancelCampaignDeliveries(campaignId);
  }

  const sql = neonSql();
  await sql`
    UPDATE campaign_deliveries
    SET delivered_at = NULL
    WHERE campaign_id = ${campaignId}
      AND clicked_at IS NULL
      AND converted_at IS NULL
  `;
};

export const pruneCampaignDetail = async (deliveryCutoffIso: string) => {
  if (isD1DeliveriesEnabled()) {
    return d1PruneCampaignDetail(deliveryCutoffIso);
  }

  const sql = neonSql();
  const cutoff = new Date(deliveryCutoffIso);
  await sql`DELETE FROM campaign_deliveries WHERE delivered_at < ${cutoff}`;
  await sql`DELETE FROM campaign_clicks WHERE clicked_at < ${cutoff}`;
};

export const pruneAutomationDeliveriesWithAggregates = async (deliveryCutoffIso: string) => {
  if (isD1DeliveriesEnabled()) {
    return d1PruneAutomationDeliveriesWithAggregates(deliveryCutoffIso);
  }

  const sql = neonSql();
  const cutoff = new Date(deliveryCutoffIso);
  const rows = await sql`
    WITH deleted AS (
      DELETE FROM automation_deliveries
      WHERE delivered_at < ${cutoff}
      RETURNING shop_domain, rule_key, revenue_cents
    )
    SELECT shop_domain, rule_key, COUNT(*)::BIGINT AS impressions, 0::BIGINT AS clicks,
           COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
    FROM deleted
    GROUP BY shop_domain, rule_key
  `;
  return rows.map((row) => ({
    shop_domain: String(row.shop_domain),
    rule_key: String(row.rule_key),
    impressions: Number(row.impressions ?? 0),
    clicks: 0,
    revenue_cents: Number(row.revenue_cents ?? 0),
  }));
};

export const pruneAutomationClicksWithAggregates = async (deliveryCutoffIso: string) => {
  if (isD1DeliveriesEnabled()) {
    return d1PruneAutomationClicksWithAggregates(deliveryCutoffIso);
  }

  const sql = neonSql();
  const cutoff = new Date(deliveryCutoffIso);
  const rows = await sql`
    WITH deleted AS (
      DELETE FROM automation_clicks
      WHERE clicked_at < ${cutoff}
      RETURNING shop_domain, rule_key, revenue_cents
    )
    SELECT shop_domain, rule_key, 0::BIGINT AS impressions, COUNT(*)::BIGINT AS clicks,
           COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
    FROM deleted
    GROUP BY shop_domain, rule_key
  `;
  return rows.map((row) => ({
    shop_domain: String(row.shop_domain),
    rule_key: String(row.rule_key),
    impressions: 0,
    clicks: Number(row.clicks ?? 0),
    revenue_cents: Number(row.revenue_cents ?? 0),
  }));
};

export const rollupAutomationDeliveriesForDay = async (
  shopDomain: string,
  dayStart: Date,
  dayEnd: Date,
) => {
  if (isD1DeliveriesEnabled()) {
    return d1RollupAutomationDeliveriesForDay(
      shopDomain,
      dayStart.toISOString(),
      dayEnd.toISOString(),
    );
  }

  const sql = neonSql();
  const rows = await sql`
    SELECT COUNT(*)::BIGINT AS impressions, COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
    FROM automation_deliveries
    WHERE shop_domain = ${shopDomain} AND delivered_at >= ${dayStart} AND delivered_at <= ${dayEnd}
  `;
  return {
    impressions: Number(rows[0]?.impressions ?? 0),
    revenue_cents: Number(rows[0]?.revenue_cents ?? 0),
  };
};

export const rollupAutomationClicksForDay = async (
  shopDomain: string,
  dayStart: Date,
  dayEnd: Date,
) => {
  if (isD1DeliveriesEnabled()) {
    return d1RollupAutomationClicksForDay(
      shopDomain,
      dayStart.toISOString(),
      dayEnd.toISOString(),
    );
  }

  const sql = neonSql();
  const rows = await sql`
    SELECT COUNT(*)::BIGINT AS clicks, COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
    FROM automation_clicks
    WHERE shop_domain = ${shopDomain} AND clicked_at >= ${dayStart} AND clicked_at <= ${dayEnd}
  `;
  return {
    clicks: Number(rows[0]?.clicks ?? 0),
    revenue_cents: Number(rows[0]?.revenue_cents ?? 0),
  };
};

export const findCampaignTouches = async (input: {
  shopDomain: string;
  externalIds: string[];
  windowStart: Date;
}) => {
  if (isD1DeliveriesEnabled()) {
    return d1FindCampaignTouches({
      shopDomain: input.shopDomain,
      externalIds: input.externalIds,
      windowStartIso: input.windowStart.toISOString(),
    });
  }

  const sql = neonSql();
  if (input.externalIds.length === 0) {
    return { clicks: [], deliveries: [] };
  }

  const [clicks, deliveries] = await Promise.all([
    sql`
      SELECT id, campaign_id, clicked_at
      FROM campaign_clicks
      WHERE shop_domain = ${input.shopDomain}
        AND external_id = ANY(${input.externalIds})
        AND clicked_at >= ${input.windowStart}
      ORDER BY clicked_at DESC
    `,
    sql`
      SELECT id, campaign_id, delivered_at
      FROM campaign_deliveries
      WHERE shop_domain = ${input.shopDomain}
        AND external_id = ANY(${input.externalIds})
        AND delivered_at >= ${input.windowStart}
      ORDER BY delivered_at DESC
    `,
  ]);

  return { clicks, deliveries };
};

export const findAutomationTouches = async (input: {
  shopDomain: string;
  externalIds: string[];
  windowStart: Date;
}) => {
  if (isD1DeliveriesEnabled()) {
    return d1FindAutomationTouches({
      shopDomain: input.shopDomain,
      externalIds: input.externalIds,
      windowStartIso: input.windowStart.toISOString(),
    });
  }

  const sql = neonSql();
  if (input.externalIds.length === 0) {
    return { clicks: [], deliveries: [] };
  }

  const [clicks, deliveries] = await Promise.all([
    sql`
      SELECT id, rule_key, clicked_at
      FROM automation_clicks
      WHERE shop_domain = ${input.shopDomain}
        AND external_id = ANY(${input.externalIds})
        AND clicked_at >= ${input.windowStart}
      ORDER BY clicked_at DESC
    `,
    sql`
      SELECT id, rule_key, delivered_at
      FROM automation_deliveries
      WHERE shop_domain = ${input.shopDomain}
        AND external_id = ANY(${input.externalIds})
        AND delivered_at >= ${input.windowStart}
      ORDER BY delivered_at DESC
    `,
  ]);

  return { clicks, deliveries };
};

export const hasAutomationDeliveryForRuleExternal = async (input: {
  shopDomain: string;
  ruleKey: string;
  externalId: string;
}) => {
  if (isD1DeliveriesEnabled()) {
    return d1HasAutomationDeliveryForRuleExternal(input);
  }

  const sql = neonSql();
  const rows = await sql`
    SELECT id
    FROM automation_deliveries
    WHERE shop_domain = ${input.shopDomain}
      AND rule_key = ${input.ruleKey}
      AND external_id = ${input.externalId}
    LIMIT 1
  `;
  return rows.length > 0;
};

export const findCampaignTouchesByCampaignId = async (input: {
  shopDomain: string;
  campaignId: string;
  windowStart: Date;
  mode: 'click' | 'impression';
}) => {
  if (isD1DeliveriesEnabled()) {
    return d1FindCampaignTouchesByCampaignId({
      shopDomain: input.shopDomain,
      campaignId: input.campaignId,
      windowStartIso: input.windowStart.toISOString(),
      mode: input.mode,
    });
  }

  const sql = neonSql();
  if (input.mode === 'click') {
    return sql`
      SELECT id, campaign_id, clicked_at
      FROM campaign_clicks
      WHERE shop_domain = ${input.shopDomain}
        AND campaign_id = ${input.campaignId}
        AND clicked_at >= ${input.windowStart}
      ORDER BY clicked_at DESC
      LIMIT 20
    `;
  }

  return sql`
    SELECT id, campaign_id, delivered_at
    FROM campaign_deliveries
    WHERE shop_domain = ${input.shopDomain}
      AND campaign_id = ${input.campaignId}
      AND delivered_at >= ${input.windowStart}
    ORDER BY delivered_at DESC
    LIMIT 20
  `;
};

export const findAutomationFingerprintClicks = async (input: {
  shopDomain: string;
  windowStart: Date;
  ruleKey?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  limit?: number;
}) => {
  if (isD1DeliveriesEnabled()) {
    return d1FindAutomationFingerprintClicks({
      shopDomain: input.shopDomain,
      windowStartIso: input.windowStart.toISOString(),
      ruleKey: input.ruleKey,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      limit: input.limit,
    });
  }

  const sql = neonSql();
  const ruleKey = input.ruleKey ?? null;
  const ipAddress = input.ipAddress ?? null;
  const userAgent = input.userAgent ?? null;
  const limit = input.limit ?? 20;

  if (ipAddress && userAgent) {
    return ruleKey
      ? sql`
        SELECT id, rule_key, clicked_at
        FROM automation_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND rule_key = ${ruleKey}
          AND ip_address = ${ipAddress}
          AND user_agent = ${userAgent}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `
      : sql`
        SELECT id, rule_key, clicked_at
        FROM automation_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND ip_address = ${ipAddress}
          AND user_agent = ${userAgent}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `;
  }

  if (ipAddress) {
    return ruleKey
      ? sql`
        SELECT id, rule_key, clicked_at
        FROM automation_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND rule_key = ${ruleKey}
          AND ip_address = ${ipAddress}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `
      : sql`
        SELECT id, rule_key, clicked_at
        FROM automation_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND ip_address = ${ipAddress}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `;
  }

  if (userAgent) {
    return ruleKey
      ? sql`
        SELECT id, rule_key, clicked_at
        FROM automation_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND rule_key = ${ruleKey}
          AND user_agent = ${userAgent}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `
      : sql`
        SELECT id, rule_key, clicked_at
        FROM automation_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND user_agent = ${userAgent}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `;
  }

  return [];
};

export const findAutomationFingerprintDeliveries = async (input: {
  shopDomain: string;
  windowStart: Date;
  ruleKey?: string | null;
  userAgent?: string | null;
  limit?: number;
}) => {
  if (isD1DeliveriesEnabled()) {
    return d1FindAutomationFingerprintDeliveries({
      shopDomain: input.shopDomain,
      windowStartIso: input.windowStart.toISOString(),
      ruleKey: input.ruleKey,
      userAgent: input.userAgent,
      limit: input.limit,
    });
  }

  const sql = neonSql();
  const userAgent = input.userAgent ?? null;
  if (!userAgent) {
    return [];
  }

  const ruleKey = input.ruleKey ?? null;
  const limit = input.limit ?? 20;
  return ruleKey
    ? sql`
      SELECT id, rule_key, delivered_at
      FROM automation_deliveries
      WHERE shop_domain = ${input.shopDomain}
        AND delivered_at >= ${input.windowStart}
        AND rule_key = ${ruleKey}
        AND user_agent = ${userAgent}
      ORDER BY delivered_at DESC
      LIMIT ${limit}
    `
    : sql`
      SELECT id, rule_key, delivered_at
      FROM automation_deliveries
      WHERE shop_domain = ${input.shopDomain}
        AND delivered_at >= ${input.windowStart}
        AND user_agent = ${userAgent}
      ORDER BY delivered_at DESC
      LIMIT ${limit}
    `;
};

export const findCampaignFingerprintClicks = async (input: {
  shopDomain: string;
  windowStart: Date;
  campaignId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  limit?: number;
}) => {
  if (isD1DeliveriesEnabled()) {
    return d1FindCampaignFingerprintClicks({
      shopDomain: input.shopDomain,
      windowStartIso: input.windowStart.toISOString(),
      campaignId: input.campaignId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      limit: input.limit,
    });
  }

  const sql = neonSql();
  const campaignId = input.campaignId ?? null;
  const ipAddress = input.ipAddress ?? null;
  const userAgent = input.userAgent ?? null;
  const limit = input.limit ?? 20;

  if (ipAddress && userAgent) {
    return campaignId
      ? sql`
        SELECT id, campaign_id, clicked_at
        FROM campaign_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND campaign_id = ${campaignId}
          AND ip_address = ${ipAddress}
          AND user_agent = ${userAgent}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `
      : sql`
        SELECT id, campaign_id, clicked_at
        FROM campaign_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND ip_address = ${ipAddress}
          AND user_agent = ${userAgent}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `;
  }

  if (ipAddress) {
    return campaignId
      ? sql`
        SELECT id, campaign_id, clicked_at
        FROM campaign_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND campaign_id = ${campaignId}
          AND ip_address = ${ipAddress}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `
      : sql`
        SELECT id, campaign_id, clicked_at
        FROM campaign_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND ip_address = ${ipAddress}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `;
  }

  if (userAgent) {
    return campaignId
      ? sql`
        SELECT id, campaign_id, clicked_at
        FROM campaign_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND campaign_id = ${campaignId}
          AND user_agent = ${userAgent}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `
      : sql`
        SELECT id, campaign_id, clicked_at
        FROM campaign_clicks
        WHERE shop_domain = ${input.shopDomain}
          AND clicked_at >= ${input.windowStart}
          AND user_agent = ${userAgent}
        ORDER BY clicked_at DESC
        LIMIT ${limit}
      `;
  }

  return [];
};

export const findCampaignFingerprintDeliveries = async (input: {
  shopDomain: string;
  windowStart: Date;
  campaignId?: string | null;
  userAgent?: string | null;
  limit?: number;
}) => {
  if (isD1DeliveriesEnabled()) {
    return d1FindCampaignFingerprintDeliveries({
      shopDomain: input.shopDomain,
      windowStartIso: input.windowStart.toISOString(),
      campaignId: input.campaignId,
      userAgent: input.userAgent,
      limit: input.limit,
    });
  }

  const sql = neonSql();
  const userAgent = input.userAgent ?? null;
  if (!userAgent) {
    return [];
  }

  const campaignId = input.campaignId ?? null;
  const limit = input.limit ?? 20;
  return campaignId
    ? sql`
      SELECT id, campaign_id, delivered_at
      FROM campaign_deliveries
      WHERE shop_domain = ${input.shopDomain}
        AND delivered_at >= ${input.windowStart}
        AND campaign_id = ${campaignId}
        AND user_agent = ${userAgent}
      ORDER BY delivered_at DESC
      LIMIT ${limit}
    `
    : sql`
      SELECT id, campaign_id, delivered_at
      FROM campaign_deliveries
      WHERE shop_domain = ${input.shopDomain}
        AND delivered_at >= ${input.windowStart}
        AND user_agent = ${userAgent}
      ORDER BY delivered_at DESC
      LIMIT ${limit}
    `;
};
