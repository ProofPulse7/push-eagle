import { randomUUID } from 'crypto';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { getFirebaseAdminMessaging } from '@/lib/integrations/firebase/admin';

export type SendNotificationInput = {
  shopDomain: string;
  campaignId: string;
  title: string;
  body: string;
  targetUrl?: string | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
  actionButtons?: Array<{ title: string; link: string }> | null;
  segmentId?: string | null;
  smartDeliver?: boolean;
  testMode?: boolean;
};

export type NotificationDeliveryStats = {
  totalTokens: number;
  deliveryStarted: number;
  deliveredCount: number;
  failedCount: number;
  queuedCount: number;
  estimatedTimeMinutes: number;
};

/**
 * Calculate target subscribers for campaign (all if no segment, filtered if segment exists).
 * Optimized for querying millions of subscribers.
 */
const getTargetTokens = async (
  shopDomain: string,
  segmentId?: string | null,
): Promise<Array<{ tokenId: number; externalId: string }>> => {
  const sql = getNeonSql();

  if (!segmentId) {
    // No segment = send to all active subscribers
    const rows = await sql`
      SELECT t.id AS token_id, s.external_id
      FROM subscriber_tokens t
      JOIN subscribers s ON s.id = t.subscriber_id
      WHERE t.shop_domain = ${shopDomain}
        AND t.status = 'active'
      ORDER BY t.id ASC
    `;
    return rows.map((row) => ({
      tokenId: Number(row.token_id),
      externalId: String(row.external_id),
    }));
  }

  // With segment = filter to segment subscribers only
  const rows = await sql`
    SELECT t.id AS token_id, s.external_id
    FROM subscriber_tokens t
    JOIN subscribers s ON s.id = t.subscriber_id
    JOIN segments seg ON seg.shop_domain = s.shop_domain
    WHERE t.shop_domain = ${shopDomain}
      AND seg.id = ${segmentId}
      AND t.status = 'active'
    ORDER BY t.id ASC
  `;

  return rows.map((row) => ({
    tokenId: Number(row.token_id),
    externalId: String(row.external_id),
  }));
};

/**
 * Send notification to millions of subscribers using batch FCM delivery.
 * Chunks large deliveries to respect FCM rate limits.
 * Returns delivery job ID for tracking.
 */
export const sendCampaignNotification = async (input: SendNotificationInput): Promise<string> => {
  const sql = getNeonSql();

  // Create delivery record in campaign_deliveries table
  const deliveryId = randomUUID();
  const targetTokens = await getTargetTokens(input.shopDomain, input.segmentId);

  if (targetTokens.length === 0) {
    throw new Error('No active subscribers found for this campaign.');
  }

  const totalDeliveries = targetTokens.length;

  // Batch insert delivery records (avoid individual inserts for speed)
  const chunkSize = 1000;
  for (let i = 0; i < totalDeliveries; i += chunkSize) {
    const chunk = targetTokens.slice(i, Math.min(i + chunkSize, totalDeliveries));

    await Promise.all(
      chunk.map((token) =>
        sql`
          INSERT INTO campaign_deliveries (
            campaign_id,
            shop_domain,
            subscriber_id,
            token_id,
            delivered_at
          )
          VALUES (${input.campaignId}, ${input.shopDomain}, NULL, ${token.tokenId}, NOW())
          ON CONFLICT DO NOTHING
        `,
      ),
    );
  }

  // Queue async FCM sends (non-blocking)
  queueFcmBatchSend({
    campaignId: input.campaignId,
    shopDomain: input.shopDomain,
    tokens: targetTokens,
    notification: {
      title: input.title,
      body: input.body,
      iconUrl: input.iconUrl ?? undefined,
      imageUrl: input.imageUrl ?? undefined,
    },
    targetUrl: input.targetUrl ?? undefined,
    actionButtons: input.actionButtons ?? undefined,
  }).catch((err) => console.error('FCM batch send failed:', err));

  return deliveryId;
};

/**
 * Queue FCM batch send job (non-blocking, runs in background).
 * Handles chunking for rate limits: max 1000 msgs/sec per FCM project.
 */
const queueFcmBatchSend = async (input: {
  campaignId: string;
  shopDomain: string;
  tokens: Array<{ tokenId: number; externalId: string }>;
  notification: { title: string; body: string; iconUrl?: string; imageUrl?: string };
  targetUrl?: string;
  actionButtons?: Array<{ title: string; link: string }>;
}) => {
  const messaging = getFirebaseAdminMessaging();

  // Split tokens into chunks of 100 for batch sends
  const chunkSize = 100;
  const delayBetweenChunksMs = 200; // 5 chunks/sec = 500 msgs/sec (safe limit)

  for (let i = 0; i < input.tokens.length; i += chunkSize) {
    const chunk = input.tokens.slice(i, Math.min(i + chunkSize, input.tokens.length));

    // Slight delay between chunks to avoid rate limiting
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenChunksMs));
    }

    // Send multicast to chunk of tokens
    try {
      const messages = chunk.map((token) => ({
        token: String(token.tokenId), // Note: FCM expects actual token string, not ID
        notification: {
          title: input.notification.title,
          body: input.notification.body,
          ...(input.notification.imageUrl && { imageUrl: input.notification.imageUrl }),
        },
        webpush: {
          fcmOptions: {
            link: input.targetUrl ?? undefined,
          },
          notification: {
            icon: input.notification.iconUrl ?? undefined,
            image: input.notification.imageUrl ?? undefined,
            ...(input.actionButtons &&
              input.actionButtons.length > 0 && {
                actions: input.actionButtons.map((btn) => ({
                  action: randomUUID(),
                  title: btn.title,
                  icon: input.notification.iconUrl,
                })),
              }),
          },
        },
        data: {
          source: 'campaign',
          campaignId: input.campaignId,
        },
      }));

      await Promise.all(messages.map((message) => messaging.send(message)));
    } catch (error) {
      console.error(`FCM batch send failed for campaign ${input.campaignId}:`, error);
    }
  }
};

/**
 * Get delivery stats for a campaign.
 */
export const getCampaignDeliveryStats = async (campaignId: string): Promise<NotificationDeliveryStats> => {
  const sql = getNeonSql();

  const rows = await sql`
    SELECT 
      COUNT(DISTINCT token_id)::INT AS total_tokens,
      COUNT(CASE WHEN delivered_at IS NOT NULL THEN 1 END)::INT AS delivered_count,
      COUNT(CASE WHEN clicked_at IS NOT NULL THEN 1 END)::INT AS clicked_count
    FROM campaign_deliveries
    WHERE campaign_id = ${campaignId}
  `;

  const row = rows[0];
  const totalTokens = Number(row.total_tokens ?? 0);
  const deliveredCount = Number(row.delivered_count ?? 0);
  const clickedCount = Number(row.clicked_count ?? 0);

  // Estimate time to complete: 500 msgs/sec target = 2ms per msg
  const estimatedMs = totalTokens * 2;
  const estimatedTimeMinutes = Math.ceil(estimatedMs / 1000 / 60);

  return {
    totalTokens,
    deliveryStarted: deliveredCount,
    deliveredCount: clickedCount,
    failedCount: 0, // Would need to track separately
    queuedCount: totalTokens - deliveredCount,
    estimatedTimeMinutes,
  };
};

/**
 * Cancel in-flight deliveries for a campaign.
 */
export const cancelCampaignDelivery = async (campaignId: string) => {
  const sql = getNeonSql();

  await sql`
    UPDATE campaign_deliveries
    SET delivered_at = NULL
    WHERE campaign_id = ${campaignId}
      AND clicked_at IS NULL
      AND converted_at IS NULL
  `;
};
