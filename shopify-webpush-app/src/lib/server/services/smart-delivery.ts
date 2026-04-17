import { randomUUID } from 'crypto';
import { getNeonSql } from '@/lib/integrations/database/neon';

export type SmartDeliveryMetrics = {
  externalId: string;
  optimalSendHour?: number | null;
  engagementScore: number; // 0-1.0
  clickThroughRate: number; // 0-1.0
  conversionRate: number; // 0-1.0
  lastInteractionAt?: string | null;
};

/**
 * Calculate optimal send hour for a subscriber based on their past interaction patterns.
 * Analyzes click times to find peak engagement window.
 */
const calculateOptimalSendHour = (clickTimes: Date[]): number | null => {
  if (clickTimes.length === 0) {
    return null;
  }

  const hourBuckets = Array(24).fill(0);
  clickTimes.forEach((time) => {
    const hour = new Date(time).getHours();
    hourBuckets[hour]++;
  });

  const maxHour = hourBuckets.indexOf(Math.max(...hourBuckets));
  return maxHour;
};

/**
 * Record or update smart delivery metrics for a subscriber.
 * Called after each campaign interaction.
 */
export const upsertSmartDeliveryMetrics = async (
  shopDomain: string,
  externalId: string,
): Promise<SmartDeliveryMetrics | null> => {
  const sql = getNeonSql();

  // Fetch recent clicks for this subscriber
  const clickRows = await sql`
    SELECT clicked_at
    FROM campaign_clicks
    WHERE shop_domain = ${shopDomain}
      AND subscriber_id = (
        SELECT id FROM subscribers WHERE shop_domain = ${shopDomain} AND external_id = ${externalId} LIMIT 1
      )
      AND clicked_at >= NOW() - INTERVAL '90 days'
    ORDER BY clicked_at DESC
    LIMIT 100
  `;

  const clickTimes = clickRows
    .map((row) => (row.clicked_at ? new Date(row.clicked_at) : null))
    .filter((date) => date !== null) as Date[];

  // Fetch total deliveries and conversions
  const statsRows = await sql`
    SELECT
      COUNT(DISTINCT cd.id)::INT AS total_deliveries,
      COUNT(DISTINCT CASE WHEN cd.clicked_at IS NOT NULL THEN cd.id END)::INT AS clicks,
      COUNT(DISTINCT CASE WHEN cd.converted_at IS NOT NULL THEN cd.id END)::INT AS conversions
    FROM campaign_deliveries cd
    WHERE cd.shop_domain = ${shopDomain}
      AND cd.subscriber_id = (
        SELECT id FROM subscribers WHERE shop_domain = ${shopDomain} AND external_id = ${externalId} LIMIT 1
      )
      AND cd.delivered_at >= NOW() - INTERVAL '180 days'
  `;

  const statsRow = statsRows[0];
  const totalDeliveries = Number(statsRow?.total_deliveries ?? 0);
  const clicks = Number(statsRow?.clicks ?? 0);
  const conversions = Number(statsRow?.conversions ?? 0);

  const clickThroughRate = totalDeliveries > 0 ? clicks / totalDeliveries : 0;
  const conversionRate = totalDeliveries > 0 ? conversions / totalDeliveries : 0;

  // Engagement score: weighted combination of CTR and conversion rate
  const engagementScore = clickThroughRate * 0.6 + conversionRate * 0.4;

  const optimalSendHour = calculateOptimalSendHour(clickTimes);
  const lastInteractionAt = clickTimes[0]?.toISOString() ?? null;

  const metricsId = randomUUID();

  await sql`
    INSERT INTO smart_delivery_metrics (
      id,
      shop_domain,
      external_id,
      optimal_send_hour,
      engagement_score,
      click_through_rate,
      conversion_rate,
      last_interaction_at,
      updated_at
    )
    VALUES (
      ${metricsId},
      ${shopDomain},
      ${externalId},
      ${optimalSendHour ?? null},
      ${engagementScore},
      ${clickThroughRate},
      ${conversionRate},
      ${lastInteractionAt},
      NOW()
    )
    ON CONFLICT (shop_domain, external_id) DO UPDATE SET
      optimal_send_hour = EXCLUDED.optimal_send_hour,
      engagement_score = EXCLUDED.engagement_score,
      click_through_rate = EXCLUDED.click_through_rate,
      conversion_rate = EXCLUDED.conversion_rate,
      last_interaction_at = EXCLUDED.last_interaction_at,
      updated_at = NOW()
  `;

  return {
    externalId,
    optimalSendHour: optimalSendHour ?? undefined,
    engagementScore,
    clickThroughRate,
    conversionRate,
    lastInteractionAt,
  };
};

/**
 * Get smart delivery metrics for a subscriber.
 */
export const getSmartDeliveryMetrics = async (
  shopDomain: string,
  externalId: string,
): Promise<SmartDeliveryMetrics | null> => {
  const sql = getNeonSql();

  const rows = await sql`
    SELECT
      external_id,
      optimal_send_hour,
      engagement_score,
      click_through_rate,
      conversion_rate,
      last_interaction_at
    FROM smart_delivery_metrics
    WHERE shop_domain = ${shopDomain}
      AND external_id = ${externalId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    externalId: String(row.external_id),
    optimalSendHour: row.optimal_send_hour ? Number(row.optimal_send_hour) : undefined,
    engagementScore: Number(row.engagement_score ?? 0),
    clickThroughRate: Number(row.click_through_rate ?? 0),
    conversionRate: Number(row.conversion_rate ?? 0),
    lastInteractionAt: row.last_interaction_at ? String(row.last_interaction_at) : undefined,
  };
};

/**
 * Optimize send times for a campaign using smart delivery:
 * - Split subscribers into waves based on optimal send hour
 * - Distribute sends across 24 hours for better engagement
 */
export const optimizeCampaignDeliveryTiming = async (
  campaignId: string,
  shopDomain: string,
): Promise<Array<{ hour: number; count: number; sendAt: Date }>> => {
  const sql = getNeonSql();

  // Get subscribers with smart delivery metrics
  const rows = await sql`
    SELECT 
      sdm.optimal_send_hour,
      COUNT(DISTINCT cd.subscriber_id)::INT AS count
    FROM campaign_deliveries cd
    JOIN smart_delivery_metrics sdm 
      ON sdm.shop_domain = cd.shop_domain 
      AND sdm.external_id = (
        SELECT external_id FROM subscribers WHERE id = cd.subscriber_id LIMIT 1
      )
    WHERE cd.campaign_id = ${campaignId}
      AND sdm.optimal_send_hour IS NOT NULL
    GROUP BY sdm.optimal_send_hour
    ORDER BY sdm.optimal_send_hour ASC
  `;

  const result = rows.map((row) => {
    const hour = Number(row.optimal_send_hour ?? 0);
    const count = Number(row.count ?? 0);

    // Calculate send time: today at this hour, or tomorrow if past
    const now = new Date();
    const sendAt = new Date(now);
    sendAt.setHours(hour, 0, 0, 0);

    if (sendAt <= now) {
      sendAt.setDate(sendAt.getDate() + 1);
    }

    return { hour, count, sendAt };
  });

  return result;
};

/**
 * Prune old smart delivery metrics (keep 180 days for patterns).
 */
export const pruneOldSmartDeliveryMetrics = async (retentionDays = 180) => {
  const sql = getNeonSql();

  await sql`
    DELETE FROM smart_delivery_metrics
    WHERE updated_at < NOW() - INTERVAL '${retentionDays} days'
  `;
};
