import { env } from '@/lib/config/env';
import { getFirebaseAdminMessaging } from '@/lib/integrations/firebase/admin';
import { isVapidConfigured } from '@/lib/integrations/firebase/vapid';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { getMerchantBilling } from '@/lib/server/billing/merchant-billing';
import {
  countCampaignAudienceTokens,
  getSubscriberKpis,
  listCampaigns,
  requeueStaleSendingCampaigns,
  resolveCampaignAudience,
} from '@/lib/server/data/store';
import { probeCronPendingWork } from '@/lib/server/cron/cron-work-probe';
import { kickOffCampaignSendContinuation } from '@/lib/server/campaigns/campaign-send-queue';

const redactToken = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= 12) {
    return `${trimmed.slice(0, 4)}…`;
  }
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)} (${trimmed.length} chars)`;
};

export const runCampaignDeliveryDiagnostics = async (shopDomain: string) => {
  const sql = getNeonSql();
  const checkedAt = new Date().toISOString();
  const issues: string[] = [];
  const recommendations: string[] = [];

  const requeuedStale = await requeueStaleSendingCampaigns(shopDomain);
  for (const row of requeuedStale) {
    kickOffCampaignSendContinuation(String(row.shop_domain), String(row.id));
  }

  const [
    subscriberKpis,
    deliverableAllCount,
    deliverableSample,
    tokenStatsRows,
    subscriberOnlyRows,
    billing,
    cronProbe,
    recentCampaigns,
    stuckCampaignRows,
    pendingClaimRows,
    firebaseOk,
    vapidOk,
  ] = await Promise.all([
    getSubscriberKpis(shopDomain),
    countCampaignAudienceTokens(shopDomain, 'all'),
    resolveCampaignAudience(shopDomain, 'all'),
    sql`
      SELECT
        COUNT(*)::INT AS total_tokens,
        COUNT(*) FILTER (WHERE status = 'active')::INT AS active_tokens,
        COUNT(*) FILTER (
          WHERE status = 'active'
            AND TRIM(COALESCE(fcm_token, '')) <> ''
            AND LOWER(COALESCE(token_type, 'fcm')) <> 'vapid'
        )::INT AS active_fcm_tokens,
        COUNT(*) FILTER (
          WHERE status = 'active'
            AND LOWER(COALESCE(token_type, 'fcm')) = 'vapid'
        )::INT AS active_vapid_tokens
      FROM subscriber_tokens
      WHERE shop_domain = ${shopDomain}
    `,
    sql`
      SELECT COUNT(*)::INT AS count
      FROM subscribers s
      WHERE s.shop_domain = ${shopDomain}
        AND NOT EXISTS (
          SELECT 1
          FROM subscriber_tokens t
          WHERE t.subscriber_id = s.id
            AND t.shop_domain = ${shopDomain}
            AND t.status = 'active'
            AND TRIM(COALESCE(t.fcm_token, '')) <> ''
        )
    `,
    getMerchantBilling(shopDomain, { reconcileUsage: false }).catch((error) => ({
      error: error instanceof Error ? error.message : 'billing_lookup_failed',
    })),
    probeCronPendingWork(),
    listCampaigns(shopDomain, 10),
    sql`
      SELECT id, title, status, segment_id, delivery_count, created_at, sent_at
      FROM campaigns
      WHERE shop_domain = ${shopDomain}
        AND status IN ('sending', 'queued')
      ORDER BY created_at DESC
      LIMIT 10
    `,
    sql`
      SELECT
        COUNT(*)::INT AS pending_claims,
        COUNT(DISTINCT subscriber_id)::INT AS pending_subscribers
      FROM campaign_deliveries
      WHERE shop_domain = ${shopDomain}
        AND fcm_message_id IS NULL
    `,
    Promise.resolve().then(() => {
      try {
        getFirebaseAdminMessaging();
        return true;
      } catch {
        return false;
      }
    }),
    Promise.resolve(isVapidConfigured()),
  ]);

  const tokenStats = (tokenStatsRows as Array<Record<string, unknown>>)[0];
  const subscribersWithoutTokens = Number((subscriberOnlyRows as Array<{ count?: unknown }>)[0]?.count ?? 0);
  const pendingClaims = Number((pendingClaimRows as Array<{ pending_claims?: unknown }>)[0]?.pending_claims ?? 0);

  if (deliverableAllCount === 0 && Number(tokenStats?.active_tokens ?? 0) > 0) {
    issues.push('Active subscriber_tokens exist but resolveCampaignAudience returned zero deliverable recipients.');
    recommendations.push('Check token_type/vapid fields and pending campaign_deliveries claims blocking audience resolution.');
  }

  if (deliverableAllCount === 0 && Number(tokenStats?.active_tokens ?? 0) === 0) {
    issues.push('No active subscriber_tokens found for this shop.');
    recommendations.push('Confirm storefront opt-in saves tokens to the same shop domain shown in this report.');
  }

  if (subscribersWithoutTokens > 0) {
    issues.push(`${subscribersWithoutTokens} subscriber row(s) exist without an active push token.`);
  }

  if (pendingClaims > 0) {
    issues.push(`${pendingClaims} pending campaign_deliveries claim(s) without fcm_message_id may block retries.`);
  }

  if (!firebaseOk) {
    issues.push('Firebase Admin is not configured (FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON or BASE64 missing/invalid).');
  }

  if (!vapidOk) {
    issues.push('VAPID keys are not configured (required for Safari/Firefox web push).');
  }

  if (!env.CRON_SECRET) {
    issues.push('CRON_SECRET is missing — background campaign processing cannot be triggered securely.');
  }

  const billingRecord = billing as Record<string, unknown>;
  if (billingRecord.error) {
    issues.push(`Billing lookup failed: ${String(billingRecord.error)}`);
  } else if (String(billingRecord.status ?? '') !== 'active') {
    issues.push(`Billing status is "${String(billingRecord.status ?? 'unknown')}" — sends may be blocked.`);
  } else if (Number(billingRecord.impressionsRemaining ?? 0) <= 0) {
    issues.push('Monthly impression limit reached — campaign sends are blocked by billing.');
  }

  if (requeuedStale.length > 0) {
    recommendations.push(`Requeued ${requeuedStale.length} stale sending campaign(s) for retry.`);
  }

  if (Number(cronProbe.queuedCampaigns ?? 0) > 0 || Number(cronProbe.sendingCampaigns ?? 0) > 0) {
    recommendations.push('Queued/sending campaigns detected — ensure /api/cron/process-campaigns runs on schedule.');
  }

  const sampleTokens = deliverableSample.slice(0, 5).map((row) => ({
    subscriberId: Number(row.subscriber_id),
    tokenId: Number(row.token_id),
    tokenType: String((row as { token_type?: string | null }).token_type ?? 'fcm'),
    fcmToken: redactToken(row.fcm_token),
    vapidEndpoint: redactToken((row as { vapid_endpoint?: string | null }).vapid_endpoint),
    hasVapidKeys: Boolean(
      String((row as { vapid_p256dh?: string | null }).vapid_p256dh ?? '').trim()
      && String((row as { vapid_auth?: string | null }).vapid_auth ?? '').trim(),
    ),
    platform: String((row as { platform?: string | null }).platform ?? ''),
  }));

  const overallStatus = issues.length === 0 ? 'healthy' : issues.length <= 2 ? 'warning' : 'critical';

  return {
    checkedAt,
    shopDomain,
    overallStatus,
    summary:
      deliverableAllCount > 0
        ? `${deliverableAllCount} subscriber(s) can receive manual campaigns right now.`
        : 'No deliverable push tokens found for manual campaigns.',
    issues,
    recommendations,
    audience: {
      subscriberRows: Number(subscriberKpis.totalSubscribers ?? 0),
      deliverableTokenRecipients: deliverableAllCount,
      subscribersWithoutActiveTokens: subscribersWithoutTokens,
    },
    tokens: {
      total: Number(tokenStats?.total_tokens ?? 0),
      active: Number(tokenStats?.active_tokens ?? 0),
      activeFcm: Number(tokenStats?.active_fcm_tokens ?? 0),
      activeVapid: Number(tokenStats?.active_vapid_tokens ?? 0),
      sample: sampleTokens,
    },
    billing: billingRecord.error
      ? { error: String(billingRecord.error) }
      : {
          status: String(billingRecord.status ?? ''),
          planKey: String(billingRecord.planKey ?? ''),
          impressionsUsed: Number(billingRecord.impressionsUsed ?? 0),
          impressionLimit: Number(billingRecord.impressionLimit ?? 0),
          impressionsRemaining: Number(billingRecord.impressionsRemaining ?? 0),
        },
    infrastructure: {
      firebaseAdminConfigured: firebaseOk,
      vapidConfigured: vapidOk,
      cronSecretConfigured: Boolean(env.CRON_SECRET),
      appUrl: env.NEXT_PUBLIC_APP_URL || env.SHOPIFY_APP_URL || null,
      processSendEndpoint: '/api/campaigns/process-send',
    },
    cron: cronProbe,
    recovery: {
      requeuedStaleSending: requeuedStale.map((row) => ({
        id: String(row.id),
        shopDomain: String(row.shop_domain),
      })),
    },
    campaigns: {
      recent: (recentCampaigns as Array<Record<string, unknown>>).slice(0, 5).map((row) => ({
        id: String((row as { id?: unknown }).id ?? ''),
        title: String((row as { title?: unknown }).title ?? ''),
        status: String((row as { status?: unknown }).status ?? ''),
        segmentId: String((row as { segment_id?: unknown }).segment_id ?? 'all'),
        deliveryCount: Number((row as { delivery_count?: unknown }).delivery_count ?? 0),
        createdAt: String((row as { created_at?: unknown }).created_at ?? ''),
        sentAt: (row as { sent_at?: unknown }).sent_at ? String((row as { sent_at?: unknown }).sent_at) : null,
      })),
      stuck: (stuckCampaignRows as Array<Record<string, unknown>>).map((row) => ({
        id: String((row as { id?: unknown }).id ?? ''),
        title: String((row as { title?: unknown }).title ?? ''),
        status: String((row as { status?: unknown }).status ?? ''),
        segmentId: String((row as { segment_id?: unknown }).segment_id ?? 'all'),
        deliveryCount: Number((row as { delivery_count?: unknown }).delivery_count ?? 0),
        createdAt: String((row as { created_at?: unknown }).created_at ?? ''),
      })),
      pendingDeliveryClaims: pendingClaims,
    },
  };
};
