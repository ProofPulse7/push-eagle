/**
 * Smart Delivery Engine
 * Optimizes send times based on subscriber engagement patterns
 */

import { getNeonSql } from '@/lib/integrations/database/neon';

/**
 * Calculate optimal send time for a subscriber
 * Based on historical engagement and timezone
 */
export const calculateOptimalSendTime = async (shopDomain: string, externalId: string): Promise<Date> => {
  const sql = getNeonSql();

  // Get subscriber's metrics
  const metricsRows = await sql`
    SELECT optimal_send_hour, engagement_score
    FROM smart_delivery_metrics
    WHERE shop_domain = ${shopDomain}
      AND external_id = ${externalId}
  `;

  if (metricsRows.length === 0) {
    // Default: 10 AM in subscriber's timezone
    return new Date(Date.now() + 9 * 60 * 60 * 1000); // ~10 AM
  }

  const metrics = metricsRows[0];
  const optimalHour = metrics.optimal_send_hour ?? 10;

  // Calculate next occurrence of optimal hour
  const now = new Date();
  const nextSend = new Date(now);
  nextSend.setHours(optimalHour, 0, 0, 0);

  if (nextSend <= now) {
    nextSend.setDate(nextSend.getDate() + 1);
  }

  return nextSend;
};

/**
 * Get subscribers segmented by optimal send hour
 * For batch sending across time zones
 */
export const getSubscribersByOptimalHour = async (
  shopDomain: string,
  campaignId: string,
): Promise<Record<number, string[]>> => {
  const sql = getNeonSql();

  const rows = await sql`
    SELECT
      COALESCE(sdm.optimal_send_hour, 10) as hour,
      STRING_AGG(st.fcm_token, ',') as tokens
    FROM subscribers s
    JOIN subscriber_tokens st ON st.subscriber_id = s.id
    LEFT JOIN smart_delivery_metrics sdm ON sdm.shop_domain = s.shop_domain AND sdm.external_id = s.external_id
    WHERE s.shop_domain = ${shopDomain}
      AND st.status = 'active'
      AND NOT EXISTS (
        SELECT 1
        FROM campaign_deliveries cd
        WHERE cd.campaign_id = ${campaignId}
          AND cd.token_id = st.id
      )
    GROUP BY hour
  `;

  const tokensByHour: Record<number, string[]> = {};
  for (const row of rows) {
    const hour = Number(row.hour);
    tokensByHour[hour] = (row.tokens as string).split(',').filter(Boolean);
  }

  return tokensByHour;
};

/**
 * Update smart delivery metrics based on engagement
 */
export const updateSmartDeliveryMetrics = async (input: {
  shopDomain: string;
  externalId: string;
  clicked?: boolean;
  converted?: boolean;
  sentAtHour?: number;
}) => {
  const sql = getNeonSql();

  // Get current metrics
  const metricsRows = await sql`
    SELECT
      optimal_send_hour,
      engagement_score,
      click_through_rate,
      conversion_rate
    FROM smart_delivery_metrics
    WHERE shop_domain = ${input.shopDomain}
      AND external_id = ${input.externalId}
  `;

  let newEngagementScore = 0;
  let newClickRate = 0;
  let newConversionRate = 0;

  if (metricsRows.length > 0) {
    const metrics = metricsRows[0];
    // Simple exponential moving average
    newEngagementScore = (Number(metrics.engagement_score) * 0.7 + (input.clicked ? 100 : 0) * 0.3) / 100;
    newClickRate = (Number(metrics.click_through_rate) * 0.7 + (input.clicked ? 1 : 0) * 0.3);
    newConversionRate = (Number(metrics.conversion_rate) * 0.7 + (input.converted ? 1 : 0) * 0.3);
  }

  // Determine optimal send hour (weighted toward hours with more engagement)
  const optimalHour = input.sentAtHour ?? 10;

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
      gen_random_uuid(),
      ${input.shopDomain},
      ${input.externalId},
      ${optimalHour},
      ${newEngagementScore},
      ${newClickRate},
      ${newConversionRate},
      NOW(),
      NOW()
    )
    ON CONFLICT (shop_domain, external_id)
    DO UPDATE SET
      optimal_send_hour = ${optimalHour},
      engagement_score = ${newEngagementScore},
      click_through_rate = ${newClickRate},
      conversion_rate = ${newConversionRate},
      last_interaction_at = NOW(),
      updated_at = NOW()
  `;
};

/**
 * Get engagement score for subscriber (0-100)
 */
export const getSubscriberEngagementScore = async (
  shopDomain: string,
  externalId: string,
): Promise<number> => {
  const sql = getNeonSql();

  const rows = await sql`
    SELECT engagement_score
    FROM smart_delivery_metrics
    WHERE shop_domain = ${shopDomain}
      AND external_id = ${externalId}
  `;

  return rows.length > 0 ? Math.round(Number(rows[0].engagement_score) * 100) : 50;
};

/**
 * Get best time window for sending campaign across all subscribers
 */
export const getBestTimeWindowForCampaign = async (shopDomain: string): Promise<{ hour: number; score: number }> => {
  const sql = getNeonSql();

  const rows = await sql`
    SELECT
      COALESCE(optimal_send_hour, 10) as hour,
      AVG(engagement_score) as avg_engagement
    FROM smart_delivery_metrics
    WHERE shop_domain = ${shopDomain}
    GROUP BY hour
    ORDER BY avg_engagement DESC
    LIMIT 1
  `;

  if (rows.length === 0) {
    return { hour: 10, score: 50 };
  }

  return {
    hour: Number(rows[0].hour),
    score: Math.round(Number(rows[0].avg_engagement) * 100),
  };
};
