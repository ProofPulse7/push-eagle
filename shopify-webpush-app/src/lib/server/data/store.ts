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

type OptInSettings = {
  promptType: 'browser' | 'custom';
  title: string;
  message: string;
  allowText: string;
  allowBgColor: string;
  allowTextColor: string;
  laterText: string;
  logoUrl: string | null;
  desktopDelaySeconds: number;
  mobileDelaySeconds: number;
  maxDisplaysPerSession: number;
  hideForDays: number;
  desktopPosition: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  mobilePosition: 'top' | 'bottom';
  placementPreset: 'balanced' | 'safe-left' | 'safe-right' | 'safe-top' | 'safe-bottom';
  offsetX: number;
  offsetY: number;
};

type UpdateOptInSettingsInput = {
  shopDomain: string;
} & OptInSettings;

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

type RegisterWebhookEventInput = {
  shopDomain: string;
  topic: string;
  eventId: string;
};

type UpsertMerchantProfileInput = {
  shopDomain: string;
  shopId?: string | null;
  storeName?: string | null;
  email?: string | null;
  primaryDomain?: string | null;
  myshopifyDomain?: string | null;
  currencyCode?: string | null;
  timezone?: string | null;
  planName?: string | null;
  ownerName?: string | null;
  scopes?: string | null;
};

type UpsertShopifyCustomerInput = {
  shopDomain: string;
  customerId?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

let schemaReadyPromise: Promise<void> | null = null;

const defaultOptInSettings: OptInSettings = {
  promptType: 'custom',
  title: 'Never miss a sale 🛍️',
  message: 'Subscribe to get updates on our new products and exclusive promotions.',
  allowText: 'Allow',
  allowBgColor: '#2e5fdc',
  allowTextColor: '#ffffff',
  laterText: 'Later',
  logoUrl: null,
  desktopDelaySeconds: 5,
  mobileDelaySeconds: 10,
  maxDisplaysPerSession: 10,
  hideForDays: 2,
  desktopPosition: 'top-center',
  mobilePosition: 'top',
  placementPreset: 'balanced',
  offsetX: 0,
  offsetY: 0,
};

const ensureSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const sql = getNeonSql();

      await sql`CREATE TABLE IF NOT EXISTS merchants (
        shop_domain TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS first_installed_at TIMESTAMPTZ`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS last_authenticated_at TIMESTAMPTZ`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS shop_id TEXT`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS store_name TEXT`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS email TEXT`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS primary_domain TEXT`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS myshopify_domain TEXT`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS currency_code TEXT`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS timezone TEXT`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS plan_name TEXT`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS owner_name TEXT`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS scopes TEXT`;
      await sql`UPDATE merchants SET first_installed_at = COALESCE(first_installed_at, created_at), last_authenticated_at = COALESCE(last_authenticated_at, updated_at) WHERE first_installed_at IS NULL OR last_authenticated_at IS NULL`;
      await sql`UPDATE merchants SET myshopify_domain = COALESCE(myshopify_domain, shop_domain) WHERE myshopify_domain IS NULL`;

      await sql`
        DO $$
        BEGIN
          IF to_regclass('public.merchant_profiles') IS NOT NULL THEN
            INSERT INTO merchants (
              shop_domain,
              shop_id,
              store_name,
              email,
              primary_domain,
              myshopify_domain,
              currency_code,
              timezone,
              plan_name,
              owner_name,
              scopes,
              updated_at
            )
            SELECT
              p.shop_domain,
              p.shop_id,
              p.store_name,
              p.email,
              p.primary_domain,
              p.myshopify_domain,
              p.currency_code,
              p.timezone,
              p.plan_name,
              p.owner_name,
              p.scopes,
              NOW()
            FROM merchant_profiles p
            ON CONFLICT (shop_domain)
            DO UPDATE SET
              shop_id = COALESCE(EXCLUDED.shop_id, merchants.shop_id),
              store_name = COALESCE(EXCLUDED.store_name, merchants.store_name),
              email = COALESCE(EXCLUDED.email, merchants.email),
              primary_domain = COALESCE(EXCLUDED.primary_domain, merchants.primary_domain),
              myshopify_domain = COALESCE(EXCLUDED.myshopify_domain, merchants.myshopify_domain),
              currency_code = COALESCE(EXCLUDED.currency_code, merchants.currency_code),
              timezone = COALESCE(EXCLUDED.timezone, merchants.timezone),
              plan_name = COALESCE(EXCLUDED.plan_name, merchants.plan_name),
              owner_name = COALESCE(EXCLUDED.owner_name, merchants.owner_name),
              scopes = COALESCE(EXCLUDED.scopes, merchants.scopes),
              updated_at = NOW();

            DROP TABLE merchant_profiles;
          END IF;
        END
        $$
      `;

      await sql`CREATE TABLE IF NOT EXISTS shopify_customers (
        id BIGSERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        customer_id TEXT,
        email TEXT,
        first_name TEXT,
        last_name TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, customer_id)
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

      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_prompt_type TEXT NOT NULL DEFAULT 'custom'`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_title TEXT`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_message TEXT`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_allow_text TEXT`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_allow_bg_color TEXT`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_allow_text_color TEXT`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_later_text TEXT`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_logo_url TEXT`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_desktop_delay_seconds INTEGER NOT NULL DEFAULT 5`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_mobile_delay_seconds INTEGER NOT NULL DEFAULT 10`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_max_displays_per_session INTEGER NOT NULL DEFAULT 10`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_hide_for_days INTEGER NOT NULL DEFAULT 2`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_desktop_position TEXT NOT NULL DEFAULT 'top-center'`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_mobile_position TEXT NOT NULL DEFAULT 'top'`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_placement_preset TEXT NOT NULL DEFAULT 'balanced'`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_offset_x INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS opt_in_offset_y INTEGER NOT NULL DEFAULT 0`;

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

      await sql`CREATE TABLE IF NOT EXISTS webhook_events (
        id BIGSERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        topic TEXT NOT NULL,
        event_id TEXT NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, topic, event_id)
      )`;

      await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_tokens_shop_status ON subscriber_tokens(shop_domain, status)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaigns_shop_created ON campaigns(shop_domain, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_campaign ON campaign_deliveries(campaign_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaign_clicks_campaign_time ON campaign_clicks(campaign_id, clicked_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaign_clicks_shop_subscriber ON campaign_clicks(shop_domain, subscriber_id, clicked_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_customers_shop_email ON shopify_customers(shop_domain, email)`;
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
    INSERT INTO merchants (shop_domain, first_installed_at, last_authenticated_at, uninstalled_at)
    VALUES (${shopDomain}, NOW(), NOW(), NULL)
    ON CONFLICT (shop_domain)
    DO UPDATE SET
      updated_at = NOW(),
      last_authenticated_at = NOW(),
      uninstalled_at = NULL,
      first_installed_at = COALESCE(merchants.first_installed_at, NOW())
  `;

  const fallbackStoreName = shopDomain.replace(/\.myshopify\.com$/i, '').replace(/[-_]+/g, ' ').trim();

  await sql`
    UPDATE merchants
    SET
      myshopify_domain = COALESCE(myshopify_domain, ${shopDomain}),
      store_name = COALESCE(store_name, ${fallbackStoreName || null}),
      updated_at = NOW()
    WHERE shop_domain = ${shopDomain}
  `;
};

export const ensureMerchantAccount = async (shopDomain: string) => {
  await ensureSchema();
  await ensureMerchant(shopDomain);
};

export const upsertMerchantProfile = async (input: UpsertMerchantProfileInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  await sql`
    UPDATE merchants
    SET
      shop_id = COALESCE(${input.shopId ?? null}, shop_id),
      store_name = COALESCE(${input.storeName ?? null}, store_name),
      email = COALESCE(${input.email ?? null}, email),
      primary_domain = COALESCE(${input.primaryDomain ?? null}, primary_domain),
      myshopify_domain = COALESCE(${input.myshopifyDomain ?? null}, myshopify_domain),
      currency_code = COALESCE(${input.currencyCode ?? null}, currency_code),
      timezone = COALESCE(${input.timezone ?? null}, timezone),
      plan_name = COALESCE(${input.planName ?? null}, plan_name),
      owner_name = COALESCE(${input.ownerName ?? null}, owner_name),
      scopes = COALESCE(${input.scopes ?? null}, scopes),
      updated_at = NOW()
    WHERE shop_domain = ${input.shopDomain}
  `;
};

export const upsertShopifyCustomer = async (input: UpsertShopifyCustomerInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  if (!input.customerId && !input.email) {
    return;
  }

  if (input.customerId) {
    await sql`
      INSERT INTO shopify_customers (
        shop_domain,
        customer_id,
        email,
        first_name,
        last_name,
        updated_at
      )
      VALUES (
        ${input.shopDomain},
        ${input.customerId},
        ${input.email ?? null},
        ${input.firstName ?? null},
        ${input.lastName ?? null},
        NOW()
      )
      ON CONFLICT (shop_domain, customer_id)
      DO UPDATE SET
        email = COALESCE(EXCLUDED.email, shopify_customers.email),
        first_name = COALESCE(EXCLUDED.first_name, shopify_customers.first_name),
        last_name = COALESCE(EXCLUDED.last_name, shopify_customers.last_name),
        updated_at = NOW()
    `;
    return;
  }

  await sql`
    INSERT INTO shopify_customers (
      shop_domain,
      customer_id,
      email,
      first_name,
      last_name,
      updated_at
    )
    VALUES (
      ${input.shopDomain},
      NULL,
      ${input.email ?? null},
      ${input.firstName ?? null},
      ${input.lastName ?? null},
      NOW()
    )
  `;
};

export const getMerchantOverview = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(shopDomain);

  const profileRows = await sql`
    SELECT
      m.store_name,
      m.email,
      m.primary_domain,
      m.myshopify_domain,
      m.currency_code,
      m.timezone,
      m.plan_name,
      m.owner_name,
      m.scopes,
      m.first_installed_at,
      m.last_authenticated_at,
      m.uninstalled_at
    FROM merchants m
    WHERE m.shop_domain = ${shopDomain}
    LIMIT 1
  `;

  const subscriberCountRows = await sql`
    SELECT COUNT(*)::INT AS count
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
  `;

  const customerCountRows = await sql`
    SELECT COUNT(*)::INT AS count
    FROM shopify_customers
    WHERE shop_domain = ${shopDomain}
  `;

  const campaignCountRows = await sql`
    SELECT COUNT(*)::INT AS count
    FROM campaigns
    WHERE shop_domain = ${shopDomain}
  `;

  const row = profileRows[0] as
    | {
        store_name?: string | null;
        email?: string | null;
        primary_domain?: string | null;
        myshopify_domain?: string | null;
        currency_code?: string | null;
        timezone?: string | null;
        plan_name?: string | null;
        owner_name?: string | null;
        scopes?: string | null;
        first_installed_at?: string | Date | null;
        last_authenticated_at?: string | Date | null;
        uninstalled_at?: string | Date | null;
      }
    | undefined;

  return {
    shopDomain,
    storeName: row?.store_name ?? null,
    email: row?.email ?? null,
    storeUrl: row?.primary_domain ?? null,
    myshopifyDomain: row?.myshopify_domain ?? shopDomain,
    currencyCode: row?.currency_code ?? null,
    timezone: row?.timezone ?? null,
    planName: row?.plan_name ?? null,
    ownerName: row?.owner_name ?? null,
    scopes: row?.scopes ?? null,
    firstInstalledAt: row?.first_installed_at ? String(row.first_installed_at) : null,
    lastAuthenticatedAt: row?.last_authenticated_at ? String(row.last_authenticated_at) : null,
    uninstalledAt: row?.uninstalled_at ? String(row.uninstalled_at) : null,
    subscriberCount: Number(subscriberCountRows[0]?.count ?? 0),
    customerCount: Number(customerCountRows[0]?.count ?? 0),
    campaignCount: Number(campaignCountRows[0]?.count ?? 0),
  };
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

export const listDueScheduledCampaigns = async (limit = 25) => {
  await ensureSchema();
  const sql = getNeonSql();

  return sql`
    SELECT id, shop_domain, scheduled_at
    FROM campaigns
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= NOW()
    ORDER BY scheduled_at ASC
    LIMIT ${limit}
  ` as Promise<Array<{ id: string; shop_domain: string; scheduled_at: string | Date | null }>>;
};

export const sendCampaign = async (shopDomain: string, campaignId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const campaignRows = await sql`
    UPDATE campaigns
    SET status = 'sending'
    WHERE id = ${campaignId}
      AND shop_domain = ${shopDomain}
      AND status IN ('draft', 'scheduled')
    RETURNING *
  `;

  const campaign = campaignRows[0] as
    | {
        id: string;
        title: string;
        body: string;
        target_url: string | null;
        icon_url: string | null;
        image_url: string | null;
        status: string;
      }
    | undefined;

  if (!campaign) {
    const existingRows = await sql`
      SELECT status
      FROM campaigns
      WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
      LIMIT 1
    `;

    const existing = existingRows[0] as { status?: string } | undefined;

    if (!existing) {
      throw new Error('Campaign not found for this shop.');
    }

    if (existing.status === 'sent') {
      throw new Error('Campaign has already been sent.');
    }

    if (existing.status === 'sending') {
      throw new Error('Campaign is already being processed.');
    }

    throw new Error(`Campaign cannot be sent from status '${existing.status ?? 'unknown'}'.`);
  }

  const previousStatus = campaign.status;

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

  try {
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
  } catch (error) {
    await sql`
      UPDATE campaigns
      SET status = ${previousStatus}
      WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
    `;

    throw error;
  }
};

export const cleanupMerchantData = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  await sql`
    DELETE FROM merchants
    WHERE shop_domain = ${shopDomain}
  `;
};

export const markMerchantUninstalled = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  await sql`
    UPDATE merchants
    SET uninstalled_at = NOW(), updated_at = NOW()
    WHERE shop_domain = ${shopDomain}
  `;

  await sql`
    UPDATE subscriber_tokens
    SET status = 'revoked', updated_at = NOW()
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

export const getOptInSettings = async (shopDomain: string): Promise<OptInSettings> => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(shopDomain);

  await sql`
    INSERT INTO merchant_settings (shop_domain)
    VALUES (${shopDomain})
    ON CONFLICT (shop_domain) DO NOTHING
  `;

  const rows = await sql`
    SELECT
      opt_in_prompt_type,
      opt_in_title,
      opt_in_message,
      opt_in_allow_text,
      opt_in_allow_bg_color,
      opt_in_allow_text_color,
      opt_in_later_text,
      opt_in_logo_url,
      opt_in_desktop_delay_seconds,
      opt_in_mobile_delay_seconds,
      opt_in_max_displays_per_session,
      opt_in_hide_for_days,
      opt_in_desktop_position,
      opt_in_mobile_position,
      opt_in_placement_preset,
      opt_in_offset_x,
      opt_in_offset_y
    FROM merchant_settings
    WHERE shop_domain = ${shopDomain}
    LIMIT 1
  `;

  const row = rows[0];

  return {
    promptType: (row?.opt_in_prompt_type as OptInSettings['promptType']) ?? defaultOptInSettings.promptType,
    title: String(row?.opt_in_title ?? defaultOptInSettings.title),
    message: String(row?.opt_in_message ?? defaultOptInSettings.message),
    allowText: String(row?.opt_in_allow_text ?? defaultOptInSettings.allowText),
    allowBgColor: String(row?.opt_in_allow_bg_color ?? defaultOptInSettings.allowBgColor),
    allowTextColor: String(row?.opt_in_allow_text_color ?? defaultOptInSettings.allowTextColor),
    laterText: String(row?.opt_in_later_text ?? defaultOptInSettings.laterText),
    logoUrl: row?.opt_in_logo_url ? String(row.opt_in_logo_url) : defaultOptInSettings.logoUrl,
    desktopDelaySeconds: Number(row?.opt_in_desktop_delay_seconds ?? defaultOptInSettings.desktopDelaySeconds),
    mobileDelaySeconds: Number(row?.opt_in_mobile_delay_seconds ?? defaultOptInSettings.mobileDelaySeconds),
    maxDisplaysPerSession: Number(row?.opt_in_max_displays_per_session ?? defaultOptInSettings.maxDisplaysPerSession),
    hideForDays: Number(row?.opt_in_hide_for_days ?? defaultOptInSettings.hideForDays),
    desktopPosition: (row?.opt_in_desktop_position as OptInSettings['desktopPosition']) ?? defaultOptInSettings.desktopPosition,
    mobilePosition: (row?.opt_in_mobile_position as OptInSettings['mobilePosition']) ?? defaultOptInSettings.mobilePosition,
    placementPreset: (row?.opt_in_placement_preset as OptInSettings['placementPreset']) ?? defaultOptInSettings.placementPreset,
    offsetX: Number(row?.opt_in_offset_x ?? defaultOptInSettings.offsetX),
    offsetY: Number(row?.opt_in_offset_y ?? defaultOptInSettings.offsetY),
  };
};

export const updateOptInSettings = async (input: UpdateOptInSettingsInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  await sql`
    INSERT INTO merchant_settings (
      shop_domain,
      opt_in_prompt_type,
      opt_in_title,
      opt_in_message,
      opt_in_allow_text,
      opt_in_allow_bg_color,
      opt_in_allow_text_color,
      opt_in_later_text,
      opt_in_logo_url,
      opt_in_desktop_delay_seconds,
      opt_in_mobile_delay_seconds,
      opt_in_max_displays_per_session,
      opt_in_hide_for_days,
      opt_in_desktop_position,
      opt_in_mobile_position,
      opt_in_placement_preset,
      opt_in_offset_x,
      opt_in_offset_y,
      updated_at
    )
    VALUES (
      ${input.shopDomain},
      ${input.promptType},
      ${input.title},
      ${input.message},
      ${input.allowText},
      ${input.allowBgColor},
      ${input.allowTextColor},
      ${input.laterText},
      ${input.logoUrl ?? null},
      ${input.desktopDelaySeconds},
      ${input.mobileDelaySeconds},
      ${input.maxDisplaysPerSession},
      ${input.hideForDays},
      ${input.desktopPosition},
      ${input.mobilePosition},
      ${input.placementPreset},
      ${input.offsetX},
      ${input.offsetY},
      NOW()
    )
    ON CONFLICT (shop_domain)
    DO UPDATE SET
      opt_in_prompt_type = EXCLUDED.opt_in_prompt_type,
      opt_in_title = EXCLUDED.opt_in_title,
      opt_in_message = EXCLUDED.opt_in_message,
      opt_in_allow_text = EXCLUDED.opt_in_allow_text,
      opt_in_allow_bg_color = EXCLUDED.opt_in_allow_bg_color,
      opt_in_allow_text_color = EXCLUDED.opt_in_allow_text_color,
      opt_in_later_text = EXCLUDED.opt_in_later_text,
      opt_in_logo_url = EXCLUDED.opt_in_logo_url,
      opt_in_desktop_delay_seconds = EXCLUDED.opt_in_desktop_delay_seconds,
      opt_in_mobile_delay_seconds = EXCLUDED.opt_in_mobile_delay_seconds,
      opt_in_max_displays_per_session = EXCLUDED.opt_in_max_displays_per_session,
      opt_in_hide_for_days = EXCLUDED.opt_in_hide_for_days,
      opt_in_desktop_position = EXCLUDED.opt_in_desktop_position,
      opt_in_mobile_position = EXCLUDED.opt_in_mobile_position,
        opt_in_placement_preset = EXCLUDED.opt_in_placement_preset,
        opt_in_offset_x = EXCLUDED.opt_in_offset_x,
        opt_in_offset_y = EXCLUDED.opt_in_offset_y,
      updated_at = NOW()
  `;

  return {
    promptType: input.promptType,
    title: input.title,
    message: input.message,
    allowText: input.allowText,
    allowBgColor: input.allowBgColor,
    allowTextColor: input.allowTextColor,
    laterText: input.laterText,
    logoUrl: input.logoUrl ?? null,
    desktopDelaySeconds: Number(input.desktopDelaySeconds),
    mobileDelaySeconds: Number(input.mobileDelaySeconds),
    maxDisplaysPerSession: Number(input.maxDisplaysPerSession),
    hideForDays: Number(input.hideForDays),
    desktopPosition: input.desktopPosition,
    mobilePosition: input.mobilePosition,
    placementPreset: input.placementPreset,
    offsetX: Number(input.offsetX),
    offsetY: Number(input.offsetY),
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

export const registerWebhookEvent = async (input: RegisterWebhookEventInput) => {
  await ensureSchema();
  const sql = getNeonSql();

  await ensureMerchant(input.shopDomain);

  const rows = await sql`
    INSERT INTO webhook_events (shop_domain, topic, event_id)
    VALUES (${input.shopDomain}, ${input.topic}, ${input.eventId})
    ON CONFLICT (shop_domain, topic, event_id) DO NOTHING
    RETURNING id
  `;

  return rows.length > 0;
};

export const listWebhookEvents = async (shopDomain: string, limit = 100) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(shopDomain);

  const rows = await sql`
    SELECT topic, event_id, received_at
    FROM webhook_events
    WHERE shop_domain = ${shopDomain}
    ORDER BY received_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    topic: String(row.topic),
    event_id: String(row.event_id),
    received_at: row.received_at as string | Date,
  }));
};
