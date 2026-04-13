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
  city?: string | null;
  userAgent?: string | null;
  deviceContext?: Record<string, unknown> | null;
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
  iosWidgetEnabled: boolean;
  iosWidgetTitle: string;
  iosWidgetMessage: string;
};

type UpdateOptInSettingsInput = {
  shopDomain: string;
} & OptInSettings;

type RecordIosHomeScreenInput = {
  shopDomain: string;
  externalId: string;
  browser?: string | null;
  platform?: string | null;
  locale?: string | null;
  country?: string | null;
  city?: string | null;
  deviceContext?: Record<string, unknown> | null;
};

type SubscriberSortOrder = 'asc' | 'desc';

type SubscriberListRow = {
  subscriber: string;
  subscriberId: string;
  createdAt: string;
  webBrowser: string;
  os: string;
  deviceUsed: string;
  cityCountry: string;
};

type SubscriberGrowthPoint = {
  date: string;
  subscribers: number;
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
  externalId?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  tags?: string[] | null;
};

type UpsertShopifyOrderEventInput = {
  shopDomain: string;
  orderId: string;
  externalId?: string | null;
  customerId?: string | null;
  email?: string | null;
  totalPriceCents: number;
  createdAt?: string | null;
  lineItems?: Array<{
    productId?: string | null;
    productTitle?: string | null;
    collectionHint?: string | null;
  }>;
};

type SegmentConditionSelectedValue = {
  type: 'country' | 'region' | 'city';
  value: string;
  label?: string;
};

type SegmentCondition = {
  id?: string;
  type: 'Clicked' | 'Purchased' | 'Purchased a product' | 'Purchased from collection' | 'Subscribed' | 'Location' | 'Customer tag';
  operator?: 'is' | 'is not' | 'has' | 'has not';
  countOperator?: 'at least once' | 'more than' | 'less than' | 'exactly';
  countValue?: number;
  dateOperator?: 'at any time' | 'before' | 'after' | 'less than' | 'more than' | 'between' | 'in the last';
  dateValue?: { from?: string | Date; to?: string | Date };
  textValue?: string;
  daysValue?: number;
  selectedValues?: SegmentConditionSelectedValue[];
};

type SegmentConditionGroup = {
  id?: string;
  conditions: SegmentCondition[];
};

type CreateSegmentInput = {
  shopDomain: string;
  name: string;
  conditionGroups: SegmentConditionGroup[];
};

type SegmentSummary = {
  id: string;
  name: string;
  type: 'Dynamic';
  subscriberCount: number;
  criteria: string;
  createdAt: string;
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
  iosWidgetEnabled: true,
  iosWidgetTitle: 'Get notifications on your iPhone or iPad',
  iosWidgetMessage: 'Add this store to your Home Screen. When you open it from there, we will ask for notification permission using your saved prompt settings.',
};

const parseScopes = (value?: string | null) =>
  String(value || '')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);

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
        external_id TEXT,
        email TEXT,
        first_name TEXT,
        last_name TEXT,
        tags TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, customer_id)
      )`;
      await sql`ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS external_id TEXT`;
      await sql`ALTER TABLE shopify_customers ADD COLUMN IF NOT EXISTS tags TEXT`;

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
      await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS ios_home_screen_confirmed_at TIMESTAMPTZ`;
      await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS ios_home_screen_last_seen_at TIMESTAMPTZ`;
      await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS device_context JSONB`;
      await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS city TEXT`;

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
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS ios_widget_enabled BOOLEAN NOT NULL DEFAULT TRUE`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS ios_widget_title TEXT`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS ios_widget_message TEXT`;

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

      await sql`CREATE TABLE IF NOT EXISTS shopify_orders (
        id BIGSERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        order_id TEXT NOT NULL,
        external_id TEXT,
        customer_id TEXT,
        email TEXT,
        subscriber_id BIGINT REFERENCES subscribers(id) ON DELETE SET NULL,
        total_price_cents INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, order_id)
      )`;

      await sql`CREATE TABLE IF NOT EXISTS shopify_order_items (
        id BIGSERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        order_id TEXT NOT NULL,
        order_event_id BIGINT REFERENCES shopify_orders(id) ON DELETE CASCADE,
        product_id TEXT,
        product_title TEXT,
        collection_hint TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

      await sql`CREATE TABLE IF NOT EXISTS segments (
        id TEXT PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        name TEXT NOT NULL,
        condition_groups JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, name)
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
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_customers_shop_external ON shopify_customers(shop_domain, external_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_shop_subscriber ON shopify_orders(shop_domain, subscriber_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_shop_external ON shopify_orders(shop_domain, external_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_order_items_shop_order ON shopify_order_items(shop_domain, order_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_order_items_shop_product ON shopify_order_items(shop_domain, product_title)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_segments_shop_created ON segments(shop_domain, created_at DESC)`;
    })();
  }

  await schemaReadyPromise;
};

const buildTrackedUrl = (targetUrl: string | null | undefined, campaignId: string, shopDomain: string, externalId?: string | null) => {
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
    if (externalId) {
      trackerBase.searchParams.set('e', externalId);
    }
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
        external_id,
        email,
        first_name,
        last_name,
        tags,
        updated_at
      )
      VALUES (
        ${input.shopDomain},
        ${input.customerId},
        ${input.externalId ?? null},
        ${input.email ?? null},
        ${input.firstName ?? null},
        ${input.lastName ?? null},
        ${input.tags && input.tags.length > 0 ? input.tags.join(',') : null},
        NOW()
      )
      ON CONFLICT (shop_domain, customer_id)
      DO UPDATE SET
        external_id = COALESCE(EXCLUDED.external_id, shopify_customers.external_id),
        email = COALESCE(EXCLUDED.email, shopify_customers.email),
        first_name = COALESCE(EXCLUDED.first_name, shopify_customers.first_name),
        last_name = COALESCE(EXCLUDED.last_name, shopify_customers.last_name),
        tags = COALESCE(EXCLUDED.tags, shopify_customers.tags),
        updated_at = NOW()
    `;
    return;
  }

  await sql`
    INSERT INTO shopify_customers (
      shop_domain,
      customer_id,
      external_id,
      email,
      first_name,
      last_name,
      tags,
      updated_at
    )
    VALUES (
      ${input.shopDomain},
      NULL,
      ${input.externalId ?? null},
      ${input.email ?? null},
      ${input.firstName ?? null},
      ${input.lastName ?? null},
      ${input.tags && input.tags.length > 0 ? input.tags.join(',') : null},
      NOW()
    )
  `;
};

const toDate = (value?: string | Date | null) => {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const applyDateOperator = (date: Date | null, condition?: SegmentCondition) => {
  if (!date) {
    return false;
  }

  const operator = condition?.dateOperator ?? 'at any time';
  if (operator === 'at any time') {
    return true;
  }

  const now = new Date();
  const from = toDate(condition?.dateValue?.from);
  const to = toDate(condition?.dateValue?.to);
  const days = Math.max(0, Number(condition?.daysValue ?? 0));
  const ageMs = now.getTime() - date.getTime();
  const thresholdMs = days * 24 * 60 * 60 * 1000;

  switch (operator) {
    case 'before':
      return from ? date.getTime() < from.getTime() : true;
    case 'after':
      return from ? date.getTime() > from.getTime() : true;
    case 'between':
      return from && to ? date.getTime() >= from.getTime() && date.getTime() <= to.getTime() : true;
    case 'less than':
    case 'in the last':
      return thresholdMs > 0 ? ageMs <= thresholdMs : true;
    case 'more than':
      return thresholdMs > 0 ? ageMs >= thresholdMs : true;
    default:
      return true;
  }
};

const applyCountOperator = (count: number, condition?: SegmentCondition) => {
  const operator = condition?.countOperator ?? 'at least once';
  const countValue = Math.max(1, Number(condition?.countValue ?? 1));

  switch (operator) {
    case 'at least once':
      return count >= 1;
    case 'more than':
      return count > countValue;
    case 'less than':
      return count < countValue;
    case 'exactly':
      return count === countValue;
    default:
      return count >= 1;
  }
};

const buildCriteriaSummary = (conditionGroups: SegmentConditionGroup[]) => {
  const first = conditionGroups[0]?.conditions[0];
  if (!first) {
    return 'Custom audience criteria';
  }

  const parts: string[] = [first.type];
  if (first.textValue) {
    parts.push(String(first.textValue));
  }

  const extraConditions = conditionGroups.reduce((total, group) => total + Math.max(0, group.conditions.length - 1), 0) + Math.max(0, conditionGroups.length - 1);
  return `${parts.join(' ')}${extraConditions > 0 ? ' and more...' : ''}`;
};

const parseConditionGroups = (value: unknown): SegmentConditionGroup[] => {
  if (Array.isArray(value)) {
    return value as SegmentConditionGroup[];
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as SegmentConditionGroup[]) : [];
    } catch {
      return [];
    }
  }

  return [];
};

const listAllSubscriberIds = async (shopDomain: string) => {
  const sql = getNeonSql();
  const rows = await sql`
    SELECT id
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
  `;
  return new Set(rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)));
};

const queryConditionSubscriberIds = async (shopDomain: string, condition: SegmentCondition, allIds: Set<number>) => {
  const sql = getNeonSql();
  const textFilter = String(condition.textValue || '').trim();

  let matched = new Set<number>();

  if (condition.type === 'Clicked') {
    const rows = await sql`
      SELECT subscriber_id, COUNT(*)::INT AS total, MAX(clicked_at) AS last_at
      FROM campaign_clicks
      WHERE shop_domain = ${shopDomain}
        AND subscriber_id IS NOT NULL
      GROUP BY subscriber_id
    `;

    for (const row of rows) {
      const subscriberId = Number(row.subscriber_id);
      const total = Number(row.total ?? 0);
      const lastAt = toDate(row.last_at ? String(row.last_at) : null);
      if (applyCountOperator(total, condition) && applyDateOperator(lastAt, condition)) {
        matched.add(subscriberId);
      }
    }
  } else if (condition.type === 'Purchased') {
    const rows = await sql`
      SELECT subscriber_id, COUNT(*)::INT AS total, MAX(created_at) AS last_at
      FROM shopify_orders
      WHERE shop_domain = ${shopDomain}
        AND subscriber_id IS NOT NULL
      GROUP BY subscriber_id
    `;

    for (const row of rows) {
      const subscriberId = Number(row.subscriber_id);
      const total = Number(row.total ?? 0);
      const lastAt = toDate(row.last_at ? String(row.last_at) : null);
      if (applyCountOperator(total, condition) && applyDateOperator(lastAt, condition)) {
        matched.add(subscriberId);
      }
    }
  } else if (condition.type === 'Purchased a product' || condition.type === 'Purchased from collection') {
    const rows = await sql`
      SELECT o.subscriber_id, COUNT(*)::INT AS total, MAX(o.created_at) AS last_at
      FROM shopify_order_items i
      JOIN shopify_orders o ON o.id = i.order_event_id
      WHERE o.shop_domain = ${shopDomain}
        AND o.subscriber_id IS NOT NULL
        AND (
          ${textFilter ? true : false} = false
          OR ${condition.type === 'Purchased from collection'} = true AND i.collection_hint ILIKE ${`%${textFilter}%`}
          OR ${condition.type === 'Purchased a product'} = true AND i.product_title ILIKE ${`%${textFilter}%`}
        )
      GROUP BY o.subscriber_id
    `;

    for (const row of rows) {
      const subscriberId = Number(row.subscriber_id);
      const total = Number(row.total ?? 0);
      const lastAt = toDate(row.last_at ? String(row.last_at) : null);
      if (applyCountOperator(total, condition) && applyDateOperator(lastAt, condition)) {
        matched.add(subscriberId);
      }
    }
  } else if (condition.type === 'Subscribed') {
    const rows = await sql`
      SELECT id, created_at
      FROM subscribers
      WHERE shop_domain = ${shopDomain}
    `;

    for (const row of rows) {
      const subscriberId = Number(row.id);
      const createdAt = toDate(row.created_at ? String(row.created_at) : null);
      if (applyDateOperator(createdAt, condition)) {
        matched.add(subscriberId);
      }
    }
  } else if (condition.type === 'Location') {
    const selected = Array.isArray(condition.selectedValues) ? condition.selectedValues : [];
    const countries = selected.filter((value) => value.type === 'country').map((value) => String(value.value).toLowerCase());
    const cities = selected.filter((value) => value.type === 'city').map((value) => String(value.value).toLowerCase());
    const regions = selected.filter((value) => value.type === 'region').map((value) => String(value.value).toLowerCase());

    const rows = await sql`
      SELECT id, country, city, device_context
      FROM subscribers
      WHERE shop_domain = ${shopDomain}
    `;

    for (const row of rows) {
      const subscriberId = Number(row.id);
      const country = String(row.country || '').toLowerCase();
      const city = String(row.city || '').toLowerCase();
      const region = String((row.device_context && (row.device_context as Record<string, unknown>).region) || '').toLowerCase();

      const countryMatch = countries.length === 0 || countries.includes(country);
      const cityMatch = cities.length === 0 || cities.includes(city);
      const regionMatch = regions.length === 0 || regions.includes(region);

      if (countryMatch && cityMatch && regionMatch) {
        matched.add(subscriberId);
      }
    }
  } else if (condition.type === 'Customer tag') {
    const rows = await sql`
      SELECT s.id
      FROM subscribers s
      JOIN shopify_customers c
        ON c.shop_domain = s.shop_domain
       AND c.external_id = s.external_id
      WHERE s.shop_domain = ${shopDomain}
        AND c.tags IS NOT NULL
        AND c.tags <> ''
        AND c.tags ILIKE ${`%${textFilter}%`}
    `;

    matched = new Set(rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id)));
  }

  const operator = condition.operator ?? (condition.type === 'Location' || condition.type === 'Customer tag' ? 'is' : 'has');
  if (operator === 'has not' || operator === 'is not') {
    const complement = new Set<number>();
    for (const id of allIds) {
      if (!matched.has(id)) {
        complement.add(id);
      }
    }
    return complement;
  }

  return matched;
};

const resolveSubscriberIdsFromConditionGroups = async (shopDomain: string, conditionGroups: SegmentConditionGroup[]) => {
  const allIds = await listAllSubscriberIds(shopDomain);
  if (conditionGroups.length === 0 || allIds.size === 0) {
    return allIds;
  }

  let intersection: Set<number> | null = null;

  for (const group of conditionGroups) {
    const groupUnion = new Set<number>();
    for (const condition of group.conditions || []) {
      const ids = await queryConditionSubscriberIds(shopDomain, condition, allIds);
      ids.forEach((id) => groupUnion.add(id));
    }

    if (intersection === null) {
      intersection = groupUnion;
      continue;
    }

    const nextIntersection = new Set<number>();
    intersection.forEach((id) => {
      if (groupUnion.has(id)) {
        nextIntersection.add(id);
      }
    });
    intersection = nextIntersection;
  }

  return intersection ?? new Set<number>();
};

export const upsertShopifyOrderEvent = async (input: UpsertShopifyOrderEventInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  const subscriberRows = input.externalId
    ? await sql`
      SELECT id
      FROM subscribers
      WHERE shop_domain = ${input.shopDomain}
        AND external_id = ${input.externalId}
      LIMIT 1
    `
    : [];

  const subscriberId = subscriberRows[0]?.id ? Number(subscriberRows[0].id) : null;
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();

  const orderRows = await sql`
    INSERT INTO shopify_orders (
      shop_domain,
      order_id,
      external_id,
      customer_id,
      email,
      subscriber_id,
      total_price_cents,
      created_at
    )
    VALUES (
      ${input.shopDomain},
      ${input.orderId},
      ${input.externalId ?? null},
      ${input.customerId ?? null},
      ${input.email ?? null},
      ${subscriberId},
      ${input.totalPriceCents},
      ${createdAt}
    )
    ON CONFLICT (shop_domain, order_id)
    DO UPDATE SET
      external_id = COALESCE(EXCLUDED.external_id, shopify_orders.external_id),
      customer_id = COALESCE(EXCLUDED.customer_id, shopify_orders.customer_id),
      email = COALESCE(EXCLUDED.email, shopify_orders.email),
      subscriber_id = COALESCE(EXCLUDED.subscriber_id, shopify_orders.subscriber_id),
      total_price_cents = EXCLUDED.total_price_cents,
      created_at = COALESCE(EXCLUDED.created_at, shopify_orders.created_at)
    RETURNING id
  `;

  const orderEventId = Number(orderRows[0]?.id ?? 0);

  await sql`
    DELETE FROM shopify_order_items
    WHERE shop_domain = ${input.shopDomain}
      AND order_id = ${input.orderId}
  `;

  for (const item of input.lineItems ?? []) {
    await sql`
      INSERT INTO shopify_order_items (
        shop_domain,
        order_id,
        order_event_id,
        product_id,
        product_title,
        collection_hint,
        created_at
      )
      VALUES (
        ${input.shopDomain},
        ${input.orderId},
        ${orderEventId},
        ${item.productId ?? null},
        ${item.productTitle ?? null},
        ${item.collectionHint ?? null},
        ${createdAt}
      )
    `;
  }
};

export const createSegment = async (input: CreateSegmentInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  const segmentId = randomUUID();
  const serializedGroups = JSON.stringify(input.conditionGroups || []);

  const rows = await sql`
    INSERT INTO segments (
      id,
      shop_domain,
      name,
      condition_groups,
      created_at,
      updated_at
    )
    VALUES (
      ${segmentId},
      ${input.shopDomain},
      ${input.name},
      ${serializedGroups}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (shop_domain, name)
    DO UPDATE SET
      condition_groups = EXCLUDED.condition_groups,
      updated_at = NOW()
    RETURNING id
  `;

  const resolvedSegmentId = String(rows[0]?.id ?? segmentId);

  const subscriberIds = await resolveSubscriberIdsFromConditionGroups(input.shopDomain, input.conditionGroups || []);
  return {
    id: resolvedSegmentId,
    name: input.name,
    type: 'Dynamic' as const,
    subscriberCount: subscriberIds.size,
    criteria: buildCriteriaSummary(input.conditionGroups || []),
  };
};

export const estimateSegmentAudience = async (shopDomain: string, conditionGroups: SegmentConditionGroup[]) => {
  await ensureSchema();
  const subscriberIds = await resolveSubscriberIdsFromConditionGroups(shopDomain, conditionGroups || []);
  return subscriberIds.size;
};

export const listSegments = async (shopDomain: string): Promise<SegmentSummary[]> => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(shopDomain);

  const rows = await sql`
    SELECT id, name, condition_groups, created_at
    FROM segments
    WHERE shop_domain = ${shopDomain}
    ORDER BY created_at DESC
  `;

  const result: SegmentSummary[] = [];
  for (const row of rows) {
    const groups = parseConditionGroups(row.condition_groups);
    const ids = await resolveSubscriberIdsFromConditionGroups(shopDomain, groups);
    result.push({
      id: String(row.id),
      name: String(row.name),
      type: 'Dynamic',
      subscriberCount: ids.size,
      criteria: buildCriteriaSummary(groups),
      createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
    });
  }

  return result;
};

export const getSegmentFilterOptions = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(shopDomain);

  const [countries, cities, regions, tags] = await Promise.all([
    sql`
      SELECT DISTINCT TRIM(country) AS value
      FROM subscribers
      WHERE shop_domain = ${shopDomain}
        AND country IS NOT NULL
        AND TRIM(country) <> ''
      ORDER BY value ASC
      LIMIT 300
    `,
    sql`
      SELECT DISTINCT TRIM(city) AS value
      FROM subscribers
      WHERE shop_domain = ${shopDomain}
        AND city IS NOT NULL
        AND TRIM(city) <> ''
      ORDER BY value ASC
      LIMIT 500
    `,
    sql`
      SELECT DISTINCT TRIM(device_context ->> 'region') AS value
      FROM subscribers
      WHERE shop_domain = ${shopDomain}
        AND device_context IS NOT NULL
        AND TRIM(device_context ->> 'region') <> ''
      ORDER BY value ASC
      LIMIT 500
    `,
    sql`
      SELECT DISTINCT TRIM(tag) AS value
      FROM (
        SELECT regexp_split_to_table(COALESCE(tags, ''), ',') AS tag
        FROM shopify_customers
        WHERE shop_domain = ${shopDomain}
      ) split_tags
      WHERE TRIM(tag) <> ''
      ORDER BY value ASC
      LIMIT 500
    `,
  ]);

  return {
    countries: countries.map((row) => String(row.value)),
    cities: cities.map((row) => String(row.value)),
    regions: regions.map((row) => String(row.value)),
    customerTags: tags.map((row) => String(row.value)),
  };
};

export const resolveCampaignAudience = async (shopDomain: string, segmentId?: string | null) => {
  await ensureSchema();
  const sql = getNeonSql();

  if (!segmentId || segmentId === 'all') {
    const rows = await sql`
      SELECT t.id AS token_id, t.fcm_token, s.id AS subscriber_id, s.external_id
      FROM subscriber_tokens t
      JOIN subscribers s ON s.id = t.subscriber_id
      WHERE t.shop_domain = ${shopDomain}
        AND t.status = 'active'
    `;
    return rows as Array<{ token_id: string | number; fcm_token: string; subscriber_id: string | number; external_id: string | null }>;
  }

  const segmentRows = await sql`
    SELECT condition_groups
    FROM segments
    WHERE shop_domain = ${shopDomain}
      AND id = ${segmentId}
    LIMIT 1
  `;

  const groups = parseConditionGroups(segmentRows[0]?.condition_groups);
  const allowedIds = await resolveSubscriberIdsFromConditionGroups(shopDomain, groups);
  if (allowedIds.size === 0) {
    return [];
  }

  const rows = await sql`
    SELECT t.id AS token_id, t.fcm_token, s.id AS subscriber_id, s.external_id
    FROM subscriber_tokens t
    JOIN subscribers s ON s.id = t.subscriber_id
    WHERE t.shop_domain = ${shopDomain}
      AND t.status = 'active'
  `;

  return (rows as Array<{ token_id: string | number; fcm_token: string; subscriber_id: string | number; external_id: string | null }>).filter((row) =>
    allowedIds.has(Number(row.subscriber_id)),
  );
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

export const getMerchantCapabilitySnapshot = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(shopDomain);

  const rows = await sql`
    SELECT
      m.primary_domain,
      m.myshopify_domain,
      m.scopes
    FROM merchants m
    WHERE m.shop_domain = ${shopDomain}
    LIMIT 1
  `;

  const row = rows[0] as
    | {
        primary_domain?: string | null;
        myshopify_domain?: string | null;
        scopes?: string | null;
      }
    | undefined;

  const grantedScopes = parseScopes(row?.scopes);

  return {
    shopDomain,
    primaryDomain: row?.primary_domain ?? null,
    myshopifyDomain: row?.myshopify_domain ?? shopDomain,
    grantedScopes,
    hasReadCustomerEvents: grantedScopes.includes('read_customer_events'),
    hasWritePixels: grantedScopes.includes('write_pixels'),
    hasReadThemes: grantedScopes.includes('read_themes'),
    hasWriteThemes: grantedScopes.includes('write_themes'),
    hasReadLocales: grantedScopes.includes('read_locales'),
    hasWriteLocales: grantedScopes.includes('write_locales'),
  };
};

export const upsertSubscriberToken = async (input: UpsertTokenInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  const serializedDeviceContext = input.deviceContext ? JSON.stringify(input.deviceContext) : null;

  await ensureMerchant(input.shopDomain);

  const subscriberRows = await sql`
    INSERT INTO subscribers (shop_domain, external_id, browser, platform, locale, country, city, device_context, last_seen_at)
    VALUES (
      ${input.shopDomain},
      ${input.externalId},
      ${input.browser ?? null},
      ${input.platform ?? null},
      ${input.locale ?? null},
      ${input.country ?? null},
      ${input.city ?? null},
      ${serializedDeviceContext}::jsonb,
      NOW()
    )
    ON CONFLICT (shop_domain, external_id)
    DO UPDATE SET
      browser = EXCLUDED.browser,
      platform = EXCLUDED.platform,
      locale = EXCLUDED.locale,
      country = EXCLUDED.country,
      city = COALESCE(EXCLUDED.city, subscribers.city),
      device_context = COALESCE(EXCLUDED.device_context, subscribers.device_context),
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

export const recordIosHomeScreenConfirmed = async (input: RecordIosHomeScreenInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  const serializedDeviceContext = input.deviceContext ? JSON.stringify(input.deviceContext) : null;

  await ensureMerchant(input.shopDomain);

  const subscriberRows = await sql`
    INSERT INTO subscribers (
      shop_domain,
      external_id,
      browser,
      platform,
      locale,
      country,
      city,
      device_context,
      last_seen_at,
      ios_home_screen_confirmed_at,
      ios_home_screen_last_seen_at
    )
    VALUES (
      ${input.shopDomain},
      ${input.externalId},
      ${input.browser ?? null},
      ${input.platform ?? 'ios'},
      ${input.locale ?? null},
      ${input.country ?? null},
      ${input.city ?? null},
      ${serializedDeviceContext}::jsonb,
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (shop_domain, external_id)
    DO UPDATE SET
      browser = COALESCE(EXCLUDED.browser, subscribers.browser),
      platform = COALESCE(EXCLUDED.platform, subscribers.platform),
      locale = COALESCE(EXCLUDED.locale, subscribers.locale),
      country = COALESCE(EXCLUDED.country, subscribers.country),
      city = COALESCE(EXCLUDED.city, subscribers.city),
      device_context = COALESCE(EXCLUDED.device_context, subscribers.device_context),
      last_seen_at = NOW(),
      ios_home_screen_confirmed_at = COALESCE(subscribers.ios_home_screen_confirmed_at, NOW()),
      ios_home_screen_last_seen_at = NOW()
    RETURNING id, ios_home_screen_confirmed_at, ios_home_screen_last_seen_at
  `;

  return {
    subscriberId: Number(subscriberRows[0]?.id),
    confirmedAt: subscriberRows[0]?.ios_home_screen_confirmed_at ? String(subscriberRows[0].ios_home_screen_confirmed_at) : null,
    lastSeenAt: subscriberRows[0]?.ios_home_screen_last_seen_at ? String(subscriberRows[0].ios_home_screen_last_seen_at) : null,
  };
};

export const getSubscriberKpis = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const totalRows = await sql`
    SELECT COUNT(*)::BIGINT AS count
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
  `;

  const newLast7Rows = await sql`
    SELECT COUNT(*)::BIGINT AS count
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
      AND created_at >= NOW() - INTERVAL '7 days'
  `;

  const prev7Rows = await sql`
    SELECT COUNT(*)::BIGINT AS count
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
      AND created_at >= NOW() - INTERVAL '14 days'
      AND created_at < NOW() - INTERVAL '7 days'
  `;

  const totalSubscribers = Number(totalRows[0]?.count ?? 0);
  const newSubscribersLast7Days = Number(newLast7Rows[0]?.count ?? 0);
  const previousPeriodCount = Number(prev7Rows[0]?.count ?? 0);
  const growthPercent = previousPeriodCount > 0
    ? ((newSubscribersLast7Days - previousPeriodCount) / previousPeriodCount) * 100
    : (newSubscribersLast7Days > 0 ? 100 : 0);

  return {
    totalSubscribers,
    newSubscribersLast7Days,
    growthPercent,
  };
};

export const listSubscribers = async (shopDomain: string, limit = 100, offset = 0, sortOrder: SubscriberSortOrder = 'desc') => {
  await ensureSchema();
  const sql = getNeonSql();

  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const safeOffset = Math.max(offset, 0);

  const rows = sortOrder === 'asc'
    ? await sql`
      SELECT
        external_id,
        created_at,
        COALESCE(NULLIF(browser, ''), NULLIF(device_context ->> 'browserName', ''), 'unknown') AS web_browser,
        COALESCE(NULLIF(platform, ''), NULLIF(device_context ->> 'osName', ''), 'unknown') AS os_name,
        COALESCE(NULLIF(device_context ->> 'deviceType', ''), 'unknown') AS device_used,
        NULLIF(city, '') AS city,
        NULLIF(country, '') AS country
      FROM subscribers
      WHERE shop_domain = ${shopDomain}
      ORDER BY created_at ASC
      LIMIT ${safeLimit}
      OFFSET ${safeOffset}
    `
    : await sql`
      SELECT
        external_id,
        created_at,
        COALESCE(NULLIF(browser, ''), NULLIF(device_context ->> 'browserName', ''), 'unknown') AS web_browser,
        COALESCE(NULLIF(platform, ''), NULLIF(device_context ->> 'osName', ''), 'unknown') AS os_name,
        COALESCE(NULLIF(device_context ->> 'deviceType', ''), 'unknown') AS device_used,
        NULLIF(city, '') AS city,
        NULLIF(country, '') AS country
      FROM subscribers
      WHERE shop_domain = ${shopDomain}
      ORDER BY created_at DESC
      LIMIT ${safeLimit}
      OFFSET ${safeOffset}
    `;

  const totalRows = await sql`
    SELECT COUNT(*)::BIGINT AS count
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
  `;

  const subscribers: SubscriberListRow[] = rows.map((row) => {
    const city = row?.city ? String(row.city) : null;
    const country = row?.country ? String(row.country) : null;
    const cityCountry = city && country
      ? `${city}, ${country}`
      : city
        ? city
        : country
          ? country
          : 'Unknown';

    return {
      subscriber: 'Anonymous',
      subscriberId: String(row?.external_id ?? ''),
      createdAt: row?.created_at ? String(row.created_at) : '',
      webBrowser: String(row?.web_browser ?? 'unknown'),
      os: String(row?.os_name ?? 'unknown'),
      deviceUsed: String(row?.device_used ?? 'unknown'),
      cityCountry,
    };
  });

  const total = Number(totalRows[0]?.count ?? 0);

  return {
    subscribers,
    total,
    hasMore: safeOffset + subscribers.length < total,
  };
};

export const getSubscriberBreakdown = async (shopDomain: string, limit = 8) => {
  await ensureSchema();
  const sql = getNeonSql();
  const safeLimit = Math.min(Math.max(limit, 1), 20);

  const browsers = await sql`
    SELECT
      LOWER(COALESCE(NULLIF(browser, ''), NULLIF(device_context ->> 'browserName', ''), 'unknown')) AS name,
      COUNT(*)::BIGINT AS value
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT ${safeLimit}
  `;

  const platforms = await sql`
    SELECT
      LOWER(COALESCE(NULLIF(platform, ''), NULLIF(device_context ->> 'osName', ''), 'unknown')) AS name,
      COUNT(*)::BIGINT AS value
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT ${safeLimit}
  `;

  return {
    browsers: browsers.map((row) => ({ name: String(row.name), value: Number(row.value ?? 0) })),
    platforms: platforms.map((row) => ({ name: String(row.name), value: Number(row.value ?? 0) })),
  };
};

export const getSubscriberLocationBreakdown = async (shopDomain: string, limit = 8) => {
  await ensureSchema();
  const sql = getNeonSql();
  const safeLimit = Math.min(Math.max(limit, 1), 20);

  const countries = await sql`
    SELECT
      COALESCE(NULLIF(country, ''), 'Unknown') AS name,
      COUNT(*)::BIGINT AS value
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT ${safeLimit}
  `;

  const cities = await sql`
    SELECT
      COALESCE(NULLIF(city, ''), 'Unknown') AS name,
      COUNT(*)::BIGINT AS value
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT ${safeLimit}
  `;

  return {
    countries: countries.map((row) => ({ name: String(row.name), value: Number(row.value ?? 0) })),
    cities: cities.map((row) => ({ name: String(row.name), value: Number(row.value ?? 0) })),
  };
};

export const getSubscriberGrowth = async (shopDomain: string, from: Date, to: Date) => {
  await ensureSchema();
  const sql = getNeonSql();

  const start = from <= to ? from : to;
  const end = from <= to ? to : from;

  const rows = await sql`
    SELECT
      gs.day::date AS day,
      COALESCE(COUNT(s.id), 0)::BIGINT AS subscribers
    FROM generate_series(${start}::timestamptz, ${end}::timestamptz, interval '1 day') AS gs(day)
    LEFT JOIN subscribers s
      ON s.shop_domain = ${shopDomain}
      AND s.created_at >= gs.day
      AND s.created_at < gs.day + interval '1 day'
    GROUP BY gs.day
    ORDER BY gs.day ASC
  `;

  const points: SubscriberGrowthPoint[] = rows.map((row) => ({
    date: row?.day ? String(row.day) : '',
    subscribers: Number(row?.subscribers ?? 0),
  }));

  return {
    points,
    totalNewSubscribers: points.reduce((sum, item) => sum + item.subscribers, 0),
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

  const rows = await sql`
    SELECT id, shop_domain, scheduled_at
    FROM campaigns
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= NOW()
    ORDER BY scheduled_at ASC
    LIMIT ${limit}
  `;

  return rows as Array<{ id: string; shop_domain: string; scheduled_at: string | Date | null }>;
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
        segment_id: string | null;
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

  const recipients = await resolveCampaignAudience(shopDomain, campaign.segment_id);

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
    const messaging = getFirebaseAdminMessaging();
    const chunkSize = 500;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < recipients.length; i += chunkSize) {
      const chunk = recipients.slice(i, i + chunkSize);
      const messages = chunk.map((item) => {
        const trackedUrl = buildTrackedUrl(campaign.target_url, campaignId, shopDomain, item.external_id);

        return {
          token: item.fcm_token,
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
        };
      });

      const multicast = await messaging.sendEach(messages);

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
      opt_in_offset_y,
      ios_widget_enabled,
      ios_widget_title,
      ios_widget_message
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
    iosWidgetEnabled: row?.ios_widget_enabled === undefined ? defaultOptInSettings.iosWidgetEnabled : Boolean(row.ios_widget_enabled),
    iosWidgetTitle: String(row?.ios_widget_title ?? defaultOptInSettings.iosWidgetTitle),
    iosWidgetMessage: String(row?.ios_widget_message ?? defaultOptInSettings.iosWidgetMessage),
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
      ios_widget_enabled,
      ios_widget_title,
      ios_widget_message,
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
      ${input.iosWidgetEnabled},
      ${input.iosWidgetTitle},
      ${input.iosWidgetMessage},
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
      ios_widget_enabled = EXCLUDED.ios_widget_enabled,
      ios_widget_title = EXCLUDED.ios_widget_title,
      ios_widget_message = EXCLUDED.ios_widget_message,
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
    iosWidgetEnabled: Boolean(input.iosWidgetEnabled),
    iosWidgetTitle: input.iosWidgetTitle,
    iosWidgetMessage: input.iosWidgetMessage,
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
