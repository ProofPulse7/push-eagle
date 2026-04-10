import { randomUUID } from 'crypto';

import { env } from '@/lib/config/env';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { getFirebaseAdminMessaging } from '@/lib/integrations/firebase/admin';

type CreateCampaignInput = {
  shopDomain: string;
  title: string;
  body: string;
  targetUrl?: string | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
  segmentId?: string | null;
  status?: 'draft' | 'scheduled' | 'sent';
  scheduledAt?: string | null;
};

type UpsertTokenInput = {
  shopDomain: string;
  externalId: string;
  token: string;
  browser?: string | null;
  platform?: string | null;
  locale?: string | null;
  country?: string | null;
  userAgent?: string | null;
};

type UpdateAttributionSettingsInput = {
  shopDomain: string;
  attributionModel: 'click' | 'impression';
  clickWindowDays: number;
  impressionWindowDays: number;
};

type TrackCampaignClickInput = {
  campaignId: string;
  shopDomain: string;
  targetUrl: string;
  externalId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  referrer?: string | null;
};

type RecordConversionInput = {
  shopDomain: string;
  orderId: string;
  revenueCents: number;
  occurredAt?: string | null;
  externalId?: string | null;
  campaignId?: string | null;
};

let schemaReadyPromise: Promise<void> | null = null;

const ensureSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const sql = getNeonSql();

      await sql`CREATE TABLE IF NOT EXISTS merchants (
        shop_domain TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

      await sql`CREATE TABLE IF NOT EXISTS subscribers (
        id BIGSERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        external_id TEXT NOT NULL,
        browser TEXT,
        platform TEXT,
        locale TEXT,
        country TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, external_id)
      )`;

      await sql`CREATE TABLE IF NOT EXISTS subscriber_tokens (
        id BIGSERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        subscriber_id BIGINT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
        fcm_token TEXT NOT NULL,
        user_agent TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, fcm_token)
      )`;

      await sql`CREATE TABLE IF NOT EXISTS campaigns (
        id TEXT PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        target_url TEXT,
        icon_url TEXT,
        image_url TEXT,
        segment_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        delivery_count INTEGER NOT NULL DEFAULT 0,
        click_count INTEGER NOT NULL DEFAULT 0,
        revenue_cents INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        scheduled_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ
      )`;

      await sql`CREATE TABLE IF NOT EXISTS merchant_settings (
        shop_domain TEXT PRIMARY KEY REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        attribution_model TEXT NOT NULL DEFAULT 'impression',
        click_window_days INTEGER NOT NULL DEFAULT 2,
        impression_window_days INTEGER NOT NULL DEFAULT 3,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

      await sql`CREATE TABLE IF NOT EXISTS campaign_deliveries (
        id BIGSERIAL PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        subscriber_id BIGINT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
        token_id BIGINT NOT NULL REFERENCES subscriber_tokens(id) ON DELETE CASCADE,
        fcm_message_id TEXT,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        clicked_at TIMESTAMPTZ,
        converted_at TIMESTAMPTZ,
        order_id TEXT,
        revenue_cents INTEGER NOT NULL DEFAULT 0
      )`;

      await sql`CREATE TABLE IF NOT EXISTS campaign_clicks (
        id BIGSERIAL PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        subscriber_id BIGINT REFERENCES subscribers(id) ON DELETE SET NULL,
        target_url TEXT NOT NULL,
        clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_agent TEXT,
        ip_address TEXT,
        referrer TEXT,
        order_id TEXT,
        converted_at TIMESTAMPTZ,
        revenue_cents INTEGER NOT NULL DEFAULT 0
      )`;

      await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_tokens_shop_status ON subscriber_tokens(shop_domain, status)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaigns_shop_created ON campaigns(shop_domain, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_campaign ON campaign_deliveries(campaign_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaign_clicks_campaign_time ON campaign_clicks(campaign_id, clicked_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaign_clicks_shop_subscriber ON campaign_clicks(shop_domain, subscriber_id, clicked_at DESC)`;
    })();
  }

  await schemaReadyPromise;
};

const buildTrackedUrl = (targetUrl: string | null | undefined, campaignId: string, shopDomain: string) => {
  if (!targetUrl) {
    return null;
  }

  try {
    const target = new URL(targetUrl);
    target.searchParams.set('utm_source', 'push_eagle');
    target.searchParams.set('utm_medium', 'web_push');
    target.searchParams.set('utm_campaign', campaignId);

    const trackerBase = new URL('/api/track/click', env.NEXT_PUBLIC_APP_URL);
    trackerBase.searchParams.set('c', campaignId);
    trackerBase.searchParams.set('s', shopDomain);
    trackerBase.searchParams.set('u', target.toString());
    return trackerBase.toString();
  } catch {
    return targetUrl;
  }
};

const ensureMerchant = async (shopDomain: string) => {
  const sql = getNeonSql();
  await sql`
    INSERT INTO merchants (shop_domain)
    VALUES (${shopDomain})
    ON CONFLICT (shop_domain)
    DO UPDATE SET updated_at = NOW()
  `;
};

export const upsertSubscriberToken = async (input: UpsertTokenInput) => {
  await ensureSchema();
  const sql = getNeonSql();

  await ensureMerchant(input.shopDomain);

  const subscriberRows = await sql`
    INSERT INTO subscribers (shop_domain, external_id, browser, platform, locale, country, last_seen_at)
    VALUES (
      ${input.shopDomain},
      ${input.externalId},
      ${input.browser ?? null},
      ${input.platform ?? null},
      ${input.locale ?? null},
      ${input.country ?? null},
      NOW()
    )
    ON CONFLICT (shop_domain, external_id)
    DO UPDATE SET
      browser = EXCLUDED.browser,
      platform = EXCLUDED.platform,
      locale = EXCLUDED.locale,
      country = EXCLUDED.country,
      last_seen_at = NOW()
    RETURNING id
  `;

  const subscriberId = Number(subscriberRows[0]?.id);

  const tokenRows = await sql`
    INSERT INTO subscriber_tokens (shop_domain, subscriber_id, fcm_token, user_agent, status, updated_at, last_seen_at)
    VALUES (
      ${input.shopDomain},
      ${subscriberId},
      ${input.token},
      ${input.userAgent ?? null},
      'active',
      NOW(),
      NOW()
    )
    ON CONFLICT (shop_domain, fcm_token)
    DO UPDATE SET
      subscriber_id = EXCLUDED.subscriber_id,
      user_agent = EXCLUDED.user_agent,
      status = 'active',
      updated_at = NOW(),
      last_seen_at = NOW()
    RETURNING id
  `;

  return {
    subscriberId,
    tokenId: Number(tokenRows[0]?.id),
  };
};

export const createCampaign = async (input: CreateCampaignInput) => {
  await ensureSchema();
  const sql = getNeonSql();

  await ensureMerchant(input.shopDomain);

  const campaignId = randomUUID();

  const campaignRows = await sql`
    INSERT INTO campaigns (
      id,
      shop_domain,
      title,
      body,
      target_url,
      icon_url,
      image_url,
      segment_id,
      status,
      scheduled_at
    )
    VALUES (
      ${campaignId},
      ${input.shopDomain},
      ${input.title},
      ${input.body},
      ${input.targetUrl ?? null},
      ${input.iconUrl ?? null},
      ${input.imageUrl ?? null},
      ${input.segmentId ?? null},
      ${input.status ?? 'draft'},
      ${input.scheduledAt ? new Date(input.scheduledAt) : null}
    )
    RETURNING *
  `;

  return campaignRows[0];
};

export const listCampaigns = async (shopDomain: string, limit = 50) => {
  await ensureSchema();
  const sql = getNeonSql();

  return sql`
    SELECT *
    FROM campaigns
    WHERE shop_domain = ${shopDomain}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
};

export const sendCampaign = async (shopDomain: string, campaignId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const campaignRows = await sql`
    SELECT *
    FROM campaigns
    WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
    LIMIT 1
  `;

  const campaign = campaignRows[0] as
    | {
        id: string;
        title: string;
        body: string;
        target_url: string | null;
        icon_url: string | null;
        image_url: string | null;
      }
    | undefined;

  if (!campaign) {
    throw new Error('Campaign not found for this shop.');
  }

  const recipients = (await sql`
    SELECT t.id AS token_id, t.fcm_token, s.id AS subscriber_id
    FROM subscriber_tokens t
    JOIN subscribers s ON s.id = t.subscriber_id
    WHERE t.shop_domain = ${shopDomain} AND t.status = 'active'
  `) as Array<{ token_id: string | number; fcm_token: string; subscriber_id: string | number }>;

  if (recipients.length === 0) {
    await sql`
      UPDATE campaigns
      SET status = 'sent', sent_at = NOW(), delivery_count = 0
      WHERE id = ${campaignId}
    `;

    return {
      successCount: 0,
      failureCount: 0,
      recipientCount: 0,
    };
  }

  const trackedUrl = buildTrackedUrl(campaign.target_url, campaignId, shopDomain);
  const messaging = getFirebaseAdminMessaging();
  const chunkSize = 500;
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < recipients.length; i += chunkSize) {
    const chunk = recipients.slice(i, i + chunkSize);
    const multicast = await messaging.sendEachForMulticast({
      tokens: chunk.map((item) => item.fcm_token),
      notification: {
        title: campaign.title,
        body: campaign.body,
        imageUrl: campaign.image_url ?? undefined,
      },
      webpush: {
        fcmOptions: {
          link: trackedUrl ?? undefined,
        },
        notification: {
          icon: campaign.icon_url ?? undefined,
          image: campaign.image_url ?? undefined,
        },
      },
      data: {
        campaignId,
        shopDomain,
      },
    });

    successCount += multicast.successCount;
    failureCount += multicast.failureCount;

    for (let index = 0; index < multicast.responses.length; index += 1) {
      const response = multicast.responses[index];
      const recipient = chunk[index];

      if (response.success) {
        await sql`
          INSERT INTO campaign_deliveries (campaign_id, shop_domain, subscriber_id, token_id, fcm_message_id)
          VALUES (
            ${campaignId},
            ${shopDomain},
            ${Number(recipient.subscriber_id)},
            ${Number(recipient.token_id)},
            ${response.messageId ?? null}
          )
        `;
        continue;
      }

      const code = response.error?.code ?? '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        await sql`
          UPDATE subscriber_tokens
          SET status = 'revoked', updated_at = NOW()
          WHERE id = ${Number(recipient.token_id)}
        `;
      }
    }
  }

  await sql`
    UPDATE campaigns
    SET
      status = 'sent',
      sent_at = NOW(),
      delivery_count = ${successCount}
    WHERE id = ${campaignId}
  `;

  return {
    successCount,
    failureCount,
    recipientCount: recipients.length,
  };
};

export const cleanupMerchantData = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  await sql`
    DELETE FROM merchants
    WHERE shop_domain = ${shopDomain}
  `;
};

export const getAttributionSettings = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(shopDomain);

  const rows = await sql`
    INSERT INTO merchant_settings (shop_domain)
    VALUES (${shopDomain})
    ON CONFLICT (shop_domain) DO NOTHING
    RETURNING shop_domain
  `;

  const settingsRows = await sql`
    SELECT attribution_model, click_window_days, impression_window_days
    FROM merchant_settings
    WHERE shop_domain = ${shopDomain}
    LIMIT 1
  `;

  return {
    attributionModel: (settingsRows[0]?.attribution_model as 'click' | 'impression') ?? 'impression',
    clickWindowDays: Number(settingsRows[0]?.click_window_days ?? 2),
    impressionWindowDays: Number(settingsRows[0]?.impression_window_days ?? 3),
  };
};

export const updateAttributionSettings = async (input: UpdateAttributionSettingsInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  await sql`
    INSERT INTO merchant_settings (shop_domain, attribution_model, click_window_days, impression_window_days, updated_at)
    VALUES (
      ${input.shopDomain},
      ${input.attributionModel},
      ${input.clickWindowDays},
      ${input.impressionWindowDays},
      NOW()
    )
    ON CONFLICT (shop_domain)
    DO UPDATE SET
      attribution_model = EXCLUDED.attribution_model,
      click_window_days = EXCLUDED.click_window_days,
      impression_window_days = EXCLUDED.impression_window_days,
      updated_at = NOW()
  `;

  return getAttributionSettings(input.shopDomain);
};

export const trackCampaignClick = async (input: TrackCampaignClickInput) => {
  await ensureSchema();
  const sql = getNeonSql();

  const subscriberRows = input.externalId
    ? await sql`
      SELECT id
      FROM subscribers
      WHERE shop_domain = ${input.shopDomain} AND external_id = ${input.externalId}
      LIMIT 1
    `
    : [];

  const subscriberId = subscriberRows[0]?.id ? Number(subscriberRows[0].id) : null;

  await sql`
    INSERT INTO campaign_clicks (
      campaign_id,
      shop_domain,
      subscriber_id,
      target_url,
      user_agent,
      ip_address,
      referrer
    )
    VALUES (
      ${input.campaignId},
      ${input.shopDomain},
      ${subscriberId},
      ${input.targetUrl},
      ${input.userAgent ?? null},
      ${input.ipAddress ?? null},
      ${input.referrer ?? null}
    )
  `;

  await sql`
    UPDATE campaigns
    SET click_count = click_count + 1
    WHERE id = ${input.campaignId} AND shop_domain = ${input.shopDomain}
  `;
};

export const recordAttributedConversion = async (input: RecordConversionInput) => {
  await ensureSchema();
  const sql = getNeonSql();

  const settings = await getAttributionSettings(input.shopDomain);
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  if (settings.attributionModel === 'click') {
    const clickWindowHours = Math.max(1, settings.clickWindowDays) * 24;
    const clickCandidates = input.externalId
      ? await sql`
        SELECT c.id, c.campaign_id
        FROM campaign_clicks c
        JOIN subscribers s ON s.id = c.subscriber_id
        WHERE c.shop_domain = ${input.shopDomain}
          AND s.external_id = ${input.externalId}
          AND c.clicked_at >= ${new Date(occurredAt.getTime() - clickWindowHours * 60 * 60 * 1000)}
        ORDER BY c.clicked_at DESC
        LIMIT 1
      `
      : [];

    const matchedClick = clickCandidates[0];
    const matchedCampaignId = (matchedClick?.campaign_id as string | undefined) ?? input.campaignId ?? null;

    if (!matchedCampaignId) {
      return { attributed: false };
    }

    if (matchedClick?.id) {
      await sql`
        UPDATE campaign_clicks
        SET converted_at = ${occurredAt}, order_id = ${input.orderId}, revenue_cents = ${input.revenueCents}
        WHERE id = ${Number(matchedClick.id)}
      `;
    }

    await sql`
      UPDATE campaigns
      SET revenue_cents = revenue_cents + ${input.revenueCents}
      WHERE id = ${matchedCampaignId} AND shop_domain = ${input.shopDomain}
    `;

    return { attributed: true, campaignId: matchedCampaignId, model: 'click' as const };
  }

  const impressionWindowHours = Math.max(1, settings.impressionWindowDays) * 24;
  const deliveryCandidates = input.externalId
    ? await sql`
      SELECT d.id, d.campaign_id
      FROM campaign_deliveries d
      JOIN subscribers s ON s.id = d.subscriber_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND s.external_id = ${input.externalId}
        AND d.delivered_at >= ${new Date(occurredAt.getTime() - impressionWindowHours * 60 * 60 * 1000)}
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `
    : [];

  const matchedDelivery = deliveryCandidates[0];
  const matchedCampaignId = (matchedDelivery?.campaign_id as string | undefined) ?? input.campaignId ?? null;

  if (!matchedCampaignId) {
    return { attributed: false };
  }

  if (matchedDelivery?.id) {
    await sql`
      UPDATE campaign_deliveries
      SET converted_at = ${occurredAt}, order_id = ${input.orderId}, revenue_cents = ${input.revenueCents}
      WHERE id = ${Number(matchedDelivery.id)}
    `;
  }

  await sql`
    UPDATE campaigns
    SET revenue_cents = revenue_cents + ${input.revenueCents}
    WHERE id = ${matchedCampaignId} AND shop_domain = ${input.shopDomain}
  `;

  return { attributed: true, campaignId: matchedCampaignId, model: 'impression' as const };
};
