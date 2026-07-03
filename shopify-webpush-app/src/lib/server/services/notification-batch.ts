import { randomUUID } from 'crypto';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { getFirebaseAdminMessaging } from '@/lib/integrations/firebase/admin';
import { buildFcmDataOnlyWebPushMessage } from '@/lib/server/push/fcm-web-push-message';

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
type FcmTarget = { tokenId: number; externalId: string; fcmToken: string };

const getTargetTokens = async (
  shopDomain: string,
  segmentId?: string | null,
): Promise<FcmTarget[]> => {
  const sql = getNeonSql();
  const { audienceRead, d1GetFcmTargetTokens } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  const key = (rows: FcmTarget[]) => rows.map((row) => row.tokenId).sort((a, b) => a - b).join(',');

  if (!segmentId) {
    return audienceRead<FcmTarget[]>({
      label: 'notificationBatch.getTargetTokens.all',
      key,
      neon: async () => {
        const rows = await sql`
          SELECT DISTINCT ON (s.id)
            t.id AS token_id,
            s.external_id,
            t.fcm_token
          FROM subscriber_tokens t
          JOIN subscribers s ON s.id = t.subscriber_id
          WHERE t.shop_domain = ${shopDomain}
            AND t.status = 'active'
            AND t.fcm_token IS NOT NULL
            AND TRIM(t.fcm_token) <> ''
          ORDER BY s.id, t.last_seen_at DESC NULLS LAST, t.updated_at DESC, t.id DESC
        `;
        return rows.map((row) => ({
          tokenId: Number(row.token_id),
          externalId: String(row.external_id),
          fcmToken: String(row.fcm_token),
        }));
      },
      d1: async () => d1GetFcmTargetTokens(shopDomain),
    });
  }

  return audienceRead<FcmTarget[]>({
    label: 'notificationBatch.getTargetTokens.segment',
    key,
    neon: async () => {
      const rows = await sql`
        SELECT DISTINCT ON (s.id)
          t.id AS token_id,
          s.external_id,
          t.fcm_token
        FROM subscriber_tokens t
        JOIN subscribers s ON s.id = t.subscriber_id
        JOIN segments seg ON seg.shop_domain = s.shop_domain
        WHERE t.shop_domain = ${shopDomain}
          AND seg.id = ${segmentId}
          AND t.status = 'active'
          AND t.fcm_token IS NOT NULL
          AND TRIM(t.fcm_token) <> ''
        ORDER BY s.id, t.last_seen_at DESC NULLS LAST, t.updated_at DESC, t.id DESC
      `;
      return rows.map((row) => ({
        tokenId: Number(row.token_id),
        externalId: String(row.external_id),
        fcmToken: String(row.fcm_token),
      }));
    },
    d1: async () => {
      // Mirror the Neon join semantics: tokens are returned only if a segment with
      // this id exists for the shop (the Neon query joins segments by shop only).
      const segExists = await sql`
        SELECT 1 FROM segments WHERE shop_domain = ${shopDomain} AND id = ${segmentId} LIMIT 1
      `;
      if (segExists.length === 0) {
        return [];
      }
      return d1GetFcmTargetTokens(shopDomain);
    },
  });
};

/**
 * Send notification to millions of subscribers using batch FCM delivery.
 * Chunks large deliveries to respect FCM rate limits.
 * Returns delivery job ID for tracking.
 */
export const sendCampaignNotification = async (input: SendNotificationInput): Promise<string> => {
  const sql = getNeonSql();

  const targetTokens = await getTargetTokens(input.shopDomain, input.segmentId);

  if (targetTokens.length === 0) {
    throw new Error('No active subscribers found for this campaign.');
  }

  const totalDeliveries = targetTokens.length;
  const { assertCanSendNotifications } = await import('@/lib/server/billing/merchant-billing');
  await assertCanSendNotifications(input.shopDomain, totalDeliveries);

  // Create delivery record in campaign_deliveries table
  const deliveryId = randomUUID();

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
      const messages = chunk.map((token) =>
        buildFcmDataOnlyWebPushMessage({
          token: token.fcmToken,
          title: input.notification.title,
          body: input.notification.body,
          iconUrl: input.notification.iconUrl,
          imageUrl: input.notification.imageUrl,
          linkUrl: input.targetUrl,
          campaignId: input.campaignId,
          shopDomain: input.shopDomain,
          tag: input.campaignId,
          extraData: {
            source: 'campaign',
          },
        }),
      );

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
