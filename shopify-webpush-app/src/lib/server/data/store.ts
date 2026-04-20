import { createHash, randomUUID } from 'crypto';

import { env } from '@/lib/config/env';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { getFirebaseAdminMessaging } from '@/lib/integrations/firebase/admin';
import { sendVapidPushNotification } from '@/lib/integrations/firebase/vapid';
import { recordPixelEvent } from '@/lib/server/automation/pixel-events';
import { deleteImageFromR2 } from '@/lib/server/media/r2';

type CreateCampaignInput = {
  shopDomain: string;
  title: string;
  body: string;
  targetUrl?: string | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
  windowsImageUrl?: string | null;
  macosImageUrl?: string | null;
  androidImageUrl?: string | null;
  actionButtons?: Array<{ title: string; link: string }>;
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
  /** For VAPID (Firefox / Safari) subscriptions */
  tokenType?: 'fcm' | 'vapid';
  vapidEndpoint?: string | null;
  vapidP256dh?: string | null;
  vapidAuth?: string | null;
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

type PrivacySettings = {
  allowSupport: boolean;
  ipAddressOption: 'anonymized' | 'no-ip';
  enableGeo: boolean;
  enablePreferences: boolean;
  emailStoreOption: 'full-email' | 'hash-email' | 'no-email';
  locationStoreOption: 'yes' | 'no';
  nameStoreOption: 'yes' | 'no';
};

type UpdatePrivacySettingsInput = {
  shopDomain: string;
} & PrivacySettings;

type BrandingSettings = {
  logoUrl: string | null;
};

type UpdateBrandingSettingsInput = {
  shopDomain: string;
} & BrandingSettings;

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

type RecordStorefrontTokenDiagnosticInput = {
  shopDomain: string;
  externalId?: string | null;
  eventType: string;
  status?: 'info' | 'success' | 'error';
  reason?: string | null;
  message?: string | null;
  tokenType?: 'fcm' | 'vapid' | null;
  browser?: string | null;
  platform?: string | null;
  locale?: string | null;
  permissionState?: string | null;
  endpoint?: string | null;
  details?: Record<string, unknown> | null;
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

type TrackAutomationClickInput = {
  ruleKey: AutomationRuleKey;
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
  customerId?: string | null;
  email?: string | null;
  userAgent?: string | null;
  platform?: string | null;
  browser?: string | null;
  country?: string | null;
};

type RegisterWebhookEventInput = {
  shopDomain: string;
  topic: string;
  eventId: string;
};

type AutomationRuleKey =
  | 'welcome_subscriber'
  | 'browse_abandonment_15m'
  | 'cart_abandonment_30m'
  | 'checkout_abandonment_30m'
  | 'shipping_notifications'
  | 'back_in_stock'
  | 'price_drop'
  | 'win_back_7d'
  | 'post_purchase_followup';

type AutomationJobPayload = {
  title: string;
  body: string;
  targetUrl?: string | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
  windowsImageUrl?: string | null;
  macosImageUrl?: string | null;
  androidImageUrl?: string | null;
  campaignLabel?: string | null;
  ruleKey?: AutomationRuleKey | null;
  externalId?: string | null;
  customerId?: string | null;
  productId?: string | null;
  cartToken?: string | null;
  orderId?: string | null;
  triggeredAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

type WelcomeStepKey = 'reminder-1' | 'reminder-2' | 'reminder-3';

type WelcomeStepConfig = {
  enabled: boolean;
  delayMinutes: number;
  title: string;
  body: string;
  targetUrl?: string | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
  windowsImageUrl?: string | null;
  macosImageUrl?: string | null;
  androidImageUrl?: string | null;
  actionButtons?: Array<{ title: string; link: string }>;
};

type WelcomeRuleConfig = {
  steps: Record<WelcomeStepKey, WelcomeStepConfig>;
};

type CartStepKey = 'cart-reminder-1' | 'cart-reminder-2' | 'cart-reminder-3';

type CartRuleConfig = {
  steps: Record<CartStepKey, WelcomeStepConfig>;
};

type BrowseStepKey = 'browse-reminder-1' | 'browse-reminder-2' | 'browse-reminder-3';

type BrowseRuleConfig = {
  steps: Record<BrowseStepKey, WelcomeStepConfig>;
};

type ShippingStepKey = 'shipping-1';

type ShippingRuleConfig = {
  sendWhen: string[];
  steps: Record<ShippingStepKey, WelcomeStepConfig>;
};

type BackInStockStepKey = 'stock-1';

type BackInStockRuleConfig = {
  steps: Record<BackInStockStepKey, WelcomeStepConfig>;
};

type PriceDropStepKey = 'price-1';

type PriceDropRuleConfig = {
  steps: Record<PriceDropStepKey, WelcomeStepConfig>;
};

type IngestionJobType = 'pixel_event' | 'shopify_order_create';

type PixelIngestionPayload = {
  shopDomain: string;
  externalId: string;
  eventType: 'page_view' | 'product_view' | 'add_to_cart' | 'checkout_start';
  pageUrl?: string | null;
  productId?: string | null;
  cartToken?: string | null;
  clientId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type OrderCreateIngestionPayload = {
  shopDomain: string;
  orderId: string;
  externalId?: string | null;
  customerId?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  customerTags?: string[] | null;
  totalPriceCents: number;
  createdAt?: string | null;
  lineItems?: Array<{
    productId?: string | null;
    productTitle?: string | null;
    collectionHint?: string | null;
  }>;
  landingSite?: string | null;
  userAgent?: string | null;
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

type UpsertShopifyProductVariantsInput = {
  shopDomain: string;
  productId: string;
  productTitle?: string | null;
  handle?: string | null;
  imageUrl?: string | null;
  updatedAt?: string | null;
  variants: Array<{
    variantId: string;
    variantTitle?: string | null;
    priceCents?: number | null;
    compareAtPriceCents?: number | null;
    inventoryItemId?: string | null;
  }>;
};

type ProcessInventoryLevelUpdateInput = {
  shopDomain: string;
  inventoryItemId: string;
  available: number | null;
  updatedAt?: string | null;
};

type ProcessFulfillmentUpdateInput = {
  shopDomain: string;
  fulfillmentId: string;
  orderId: string;
  status?: string | null;
  shipmentStatus?: string | null;
  trackingCompany?: string | null;
  trackingNumbers?: string[] | null;
  trackingUrls?: string[] | null;
  updatedAt?: string | null;
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

const defaultPrivacySettings: PrivacySettings = {
  allowSupport: true,
  ipAddressOption: 'anonymized',
  enableGeo: true,
  enablePreferences: false,
  emailStoreOption: 'full-email',
  locationStoreOption: 'yes',
  nameStoreOption: 'yes',
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
        windows_image_url TEXT,
        macos_image_url TEXT,
        android_image_url TEXT,
        action_buttons JSONB,
        segment_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        delivery_count INTEGER NOT NULL DEFAULT 0,
        click_count INTEGER NOT NULL DEFAULT 0,
        revenue_cents INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        scheduled_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ
      )`;
      await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS windows_image_url TEXT`;
      await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS macos_image_url TEXT`;
      await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS android_image_url TEXT`;
      await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS action_buttons JSONB`;

      await sql`CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        content_type TEXT NOT NULL,
        data_base64 TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS object_key TEXT`;
      await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS public_url TEXT`;
      await sql`ALTER TABLE media_assets ALTER COLUMN data_base64 DROP NOT NULL`;

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
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS support_tools_enabled BOOLEAN NOT NULL DEFAULT TRUE`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS ip_address_option TEXT NOT NULL DEFAULT 'anonymized'`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS geo_location_enabled BOOLEAN NOT NULL DEFAULT TRUE`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS notification_preferences_enabled BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS email_store_option TEXT NOT NULL DEFAULT 'full-email'`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS location_store_option TEXT NOT NULL DEFAULT 'yes'`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS name_store_option TEXT NOT NULL DEFAULT 'yes'`;
      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS brand_logo_url TEXT`;

      // VAPID / cross-browser Web Push columns on subscriber_tokens
      // token_type: 'fcm' (Chrome/Edge/Opera/Samsung) or 'vapid' (Firefox/Safari)
      await sql`ALTER TABLE subscriber_tokens ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'fcm'`;
      await sql`ALTER TABLE subscriber_tokens ADD COLUMN IF NOT EXISTS vapid_endpoint TEXT`;
      await sql`ALTER TABLE subscriber_tokens ADD COLUMN IF NOT EXISTS vapid_p256dh TEXT`;
      await sql`ALTER TABLE subscriber_tokens ADD COLUMN IF NOT EXISTS vapid_auth TEXT`;

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

      await sql`CREATE TABLE IF NOT EXISTS automation_deliveries (
        id BIGSERIAL PRIMARY KEY,
        automation_job_id TEXT,
        rule_key TEXT NOT NULL,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        subscriber_id BIGINT REFERENCES subscribers(id) ON DELETE SET NULL,
        token_id BIGINT REFERENCES subscriber_tokens(id) ON DELETE SET NULL,
        external_id TEXT,
        target_url TEXT,
        fcm_message_id TEXT,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        clicked_at TIMESTAMPTZ,
        converted_at TIMESTAMPTZ,
        order_id TEXT,
        revenue_cents INTEGER NOT NULL DEFAULT 0
      )`;

      await sql`CREATE TABLE IF NOT EXISTS automation_clicks (
        id BIGSERIAL PRIMARY KEY,
        rule_key TEXT NOT NULL,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        subscriber_id BIGINT REFERENCES subscribers(id) ON DELETE SET NULL,
        external_id TEXT,
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

      await sql`CREATE TABLE IF NOT EXISTS automation_rules (
        id TEXT PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        rule_key TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        config JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, rule_key)
      )`;

      await sql`CREATE TABLE IF NOT EXISTS automation_jobs (
        id TEXT PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        rule_key TEXT NOT NULL,
        token_id BIGINT REFERENCES subscriber_tokens(id) ON DELETE SET NULL,
        subscriber_id BIGINT REFERENCES subscribers(id) ON DELETE SET NULL,
        dedupe_key TEXT,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        due_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ
      )`;

      await sql`CREATE TABLE IF NOT EXISTS subscriber_activity_events (
        id TEXT PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        external_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        page_url TEXT,
        product_id TEXT,
        cart_token TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

      await sql`CREATE TABLE IF NOT EXISTS storefront_token_diagnostics (
        id BIGSERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        external_id TEXT,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'info',
        reason TEXT,
        message TEXT,
        token_type TEXT,
        browser TEXT,
        platform TEXT,
        locale TEXT,
        permission_state TEXT,
        endpoint TEXT,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

      await sql`CREATE TABLE IF NOT EXISTS pixel_events (
        id TEXT PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        external_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        page_url TEXT,
        product_id TEXT,
        cart_token TEXT,
        client_id TEXT,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

      await sql`CREATE TABLE IF NOT EXISTS ingestion_jobs (
        id TEXT PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        job_type TEXT NOT NULL,
        dedupe_key TEXT,
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ
      )`;

      await sql`CREATE TABLE IF NOT EXISTS campaign_schedules (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        schedule_type TEXT NOT NULL,
        send_at TIMESTAMPTZ,
        recurring_pattern TEXT,
        smart_send_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        smart_send_config JSONB,
        flash_sale_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        flash_sale_config JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

      await sql`CREATE TABLE IF NOT EXISTS smart_delivery_metrics (
        id TEXT PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        external_id TEXT NOT NULL,
        optimal_send_hour INTEGER,
        engagement_score REAL NOT NULL DEFAULT 0,
        click_through_rate REAL NOT NULL DEFAULT 0,
        conversion_rate REAL NOT NULL DEFAULT 0,
        last_interaction_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, external_id)
      )`;

      await sql`CREATE TABLE IF NOT EXISTS shopify_product_variants (
        id BIGSERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        variant_id TEXT NOT NULL,
        inventory_item_id TEXT,
        product_title TEXT,
        variant_title TEXT,
        handle TEXT,
        image_url TEXT,
        price_cents INTEGER,
        compare_at_price_cents INTEGER,
        available INTEGER,
        updated_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, variant_id)
      )`;

      await sql`CREATE TABLE IF NOT EXISTS shopify_fulfillments (
        id BIGSERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        fulfillment_id TEXT NOT NULL,
        order_id TEXT NOT NULL,
        status TEXT,
        shipment_status TEXT,
        tracking_company TEXT,
        tracking_numbers JSONB,
        tracking_urls JSONB,
        updated_at TIMESTAMPTZ,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, fulfillment_id)
      )`;

      // Backfill constraints for legacy databases that were created before unique keys existed.
      await sql`
        WITH ranked AS (
          SELECT ctid, ROW_NUMBER() OVER (
            PARTITION BY shop_domain, external_id
            ORDER BY last_seen_at DESC NULLS LAST, created_at DESC NULLS LAST
          ) AS rn
          FROM subscribers
        )
        DELETE FROM subscribers s
        USING ranked r
        WHERE s.ctid = r.ctid AND r.rn > 1
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_subscribers_shop_external_id ON subscribers(shop_domain, external_id)`;

      await sql`
        WITH ranked AS (
          SELECT ctid, ROW_NUMBER() OVER (
            PARTITION BY shop_domain, fcm_token
            ORDER BY last_seen_at DESC NULLS LAST, created_at DESC NULLS LAST
          ) AS rn
          FROM subscriber_tokens
        )
        DELETE FROM subscriber_tokens t
        USING ranked r
        WHERE t.ctid = r.ctid AND r.rn > 1
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriber_tokens_shop_fcm_token ON subscriber_tokens(shop_domain, fcm_token)`;

      await sql`
        WITH ranked AS (
          SELECT ctid, ROW_NUMBER() OVER (
            PARTITION BY shop_domain, fulfillment_id
            ORDER BY updated_at DESC NULLS LAST, last_seen_at DESC NULLS LAST
          ) AS rn
          FROM shopify_fulfillments
        )
        DELETE FROM shopify_fulfillments f
        USING ranked r
        WHERE f.ctid = r.ctid AND r.rn > 1
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_fulfillments_shop_fulfillment ON shopify_fulfillments(shop_domain, fulfillment_id)`;

      await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_tokens_shop_status ON subscriber_tokens(shop_domain, status)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaigns_shop_created ON campaigns(shop_domain, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaigns_shop_scheduled ON campaigns(shop_domain, status, scheduled_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_pixel_events_shop_created ON pixel_events(shop_domain, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_pixel_events_shop_external ON pixel_events(shop_domain, external_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_due ON ingestion_jobs(status, due_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_shop_type ON ingestion_jobs(shop_domain, job_type, status, due_at)`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_ingestion_jobs_dedupe ON ingestion_jobs(shop_domain, job_type, dedupe_key) WHERE dedupe_key IS NOT NULL`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaign_schedules_send_at ON campaign_schedules(send_at) WHERE send_at IS NOT NULL`;
      await sql`CREATE INDEX IF NOT EXISTS idx_smart_delivery_metrics_shop ON smart_delivery_metrics(shop_domain)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_campaign ON campaign_deliveries(campaign_id)`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_deliveries_campaign_token ON campaign_deliveries(campaign_id, token_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaign_clicks_campaign_time ON campaign_clicks(campaign_id, clicked_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaign_clicks_shop_subscriber ON campaign_clicks(shop_domain, subscriber_id, clicked_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_automation_deliveries_shop_rule_time ON automation_deliveries(shop_domain, rule_key, delivered_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_automation_deliveries_shop_external_time ON automation_deliveries(shop_domain, external_id, delivered_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_automation_clicks_shop_rule_time ON automation_clicks(shop_domain, rule_key, clicked_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_automation_clicks_shop_external_time ON automation_clicks(shop_domain, external_id, clicked_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_customers_shop_email ON shopify_customers(shop_domain, email)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_customers_shop_external ON shopify_customers(shop_domain, external_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_shop_subscriber ON shopify_orders(shop_domain, subscriber_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_shop_external ON shopify_orders(shop_domain, external_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_order_items_shop_order ON shopify_order_items(shop_domain, order_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_order_items_shop_product ON shopify_order_items(shop_domain, product_title)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_segments_shop_created ON segments(shop_domain, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_media_assets_shop_created ON media_assets(shop_domain, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_automation_rules_shop_rule ON automation_rules(shop_domain, rule_key)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_automation_jobs_shop_due ON automation_jobs(shop_domain, status, due_at)`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_jobs_dedupe ON automation_jobs(shop_domain, dedupe_key) WHERE dedupe_key IS NOT NULL`;
      await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_activity_shop_external_created ON subscriber_activity_events(shop_domain, external_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_activity_shop_product_created ON subscriber_activity_events(shop_domain, product_id, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_activity_shop_cart_created ON subscriber_activity_events(shop_domain, cart_token, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_storefront_diag_shop_created ON storefront_token_diagnostics(shop_domain, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_storefront_diag_shop_event_created ON storefront_token_diagnostics(shop_domain, event_type, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_product_variants_shop_variant ON shopify_product_variants(shop_domain, variant_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_product_variants_shop_inventory ON shopify_product_variants(shop_domain, inventory_item_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_product_variants_shop_product ON shopify_product_variants(shop_domain, product_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_shopify_fulfillments_shop_order ON shopify_fulfillments(shop_domain, order_id, updated_at DESC)`;
    })();
  }

  await schemaReadyPromise;
};

const buildTrackedUrl = (
  targetUrl: string | null | undefined,
  campaignId: string,
  shopDomain: string,
  externalId?: string | null,
  contentLabel?: string | null,
) => {
  if (!targetUrl) {
    return null;
  }

  const trackingBase = env.SHOPIFY_APP_URL || env.NEXT_PUBLIC_APP_URL;

  try {
    const target = new URL(targetUrl);
    target.searchParams.set('utm_source', 'push_eagle');
    target.searchParams.set('utm_medium', 'web_push');
    target.searchParams.set('utm_campaign', campaignId);
    if (contentLabel) {
      target.searchParams.set('utm_content', contentLabel);
    }

    const trackerBase = new URL('/api/track/click', trackingBase);
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

const buildAutomationTrackedUrl = (
  targetUrl: string | null | undefined,
  ruleKey: AutomationRuleKey,
  shopDomain: string,
  externalId?: string | null,
) => {
  if (!targetUrl) {
    return null;
  }

  try {
    void shopDomain;
    void externalId;
    void ruleKey;
    // Send users to the exact URL configured in automation settings.
    return new URL(targetUrl).toString();
  } catch {
    return targetUrl;
  }
};

const toAbsoluteStorefrontUrl = (candidate: string | null | undefined, fallbackShopDomain: string) => {
  const raw = String(candidate ?? '').trim();
  if (!raw) {
    return `https://${fallbackShopDomain}`;
  }

  try {
    return new URL(raw).toString();
  } catch {
    const normalizedHost = raw.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (!normalizedHost) {
      return `https://${fallbackShopDomain}`;
    }
    return `https://${normalizedHost}`;
  }
};

const toHttpUrlOrNull = (candidate: string | null | undefined, baseUrl?: string | null) => {
  const raw = String(candidate ?? '').trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const collectMediaReferences = (value: unknown): Set<string> => {
  const found = new Set<string>();
  const r2Base = env.R2_PUBLIC_BASE_URL.trim().replace(/\/$/, '');

  const walk = (node: unknown) => {
    if (node == null) {
      return;
    }

    if (typeof node === 'string') {
      const candidate = node.trim();
      if (!candidate) {
        return;
      }

      const isMediaPath = candidate.includes('/api/media/') || candidate.includes('/merchant-media/');
      const isR2Public = Boolean(r2Base && candidate.startsWith(r2Base));
      if (isMediaPath || isR2Public) {
        found.add(candidate);
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => walk(item));
      return;
    }

    if (typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach((item) => walk(item));
    }
  };

  walk(value);
  return found;
};

const extractAssetIdFromMediaUrl = (value: string) => {
  const match = value.match(/\/api\/media\/([a-z0-9-]+)/i);
  return match?.[1] ?? null;
};

const extractObjectKeyFromMediaUrl = (value: string) => {
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  } catch {
    if (value.startsWith('/')) {
      return decodeURIComponent(value.replace(/^\/+/, ''));
    }
    return null;
  }
};

const cleanupUnusedMediaAssets = async (shopDomain: string, removedUrls: string[]) => {
  const uniqueUrls = [...new Set(removedUrls.map((url) => String(url ?? '').trim()).filter(Boolean))];
  if (uniqueUrls.length === 0) {
    return;
  }

  await ensureSchema();
  const sql = getNeonSql();

  type MediaAssetRef = {
    id: string;
    public_url: string | null;
    object_key: string | null;
    shop_domain: string;
  };

  for (const mediaUrl of uniqueUrls) {
    let mediaAssetRow: MediaAssetRef | null = null;

    const assetId = extractAssetIdFromMediaUrl(mediaUrl);
    if (assetId) {
      const rows = await sql`
        SELECT id, public_url, object_key, shop_domain
        FROM media_assets
        WHERE id = ${assetId}
          AND shop_domain = ${shopDomain}
        LIMIT 1
      `;
      mediaAssetRow = (rows[0] as MediaAssetRef | undefined) ?? null;
    }

    if (!mediaAssetRow) {
      const rows = await sql`
        SELECT id, public_url, object_key, shop_domain
        FROM media_assets
        WHERE public_url = ${mediaUrl}
          AND shop_domain = ${shopDomain}
        LIMIT 1
      `;
      mediaAssetRow = (rows[0] as MediaAssetRef | undefined) ?? null;
    }

    if (!mediaAssetRow) {
      const objectKey = extractObjectKeyFromMediaUrl(mediaUrl);
      if (objectKey) {
        const rows = await sql`
          SELECT id, public_url, object_key, shop_domain
          FROM media_assets
          WHERE object_key = ${objectKey}
            AND shop_domain = ${shopDomain}
          LIMIT 1
        `;
        mediaAssetRow = (rows[0] as MediaAssetRef | undefined) ?? null;
      }
    }

    if (!mediaAssetRow || !mediaAssetRow.object_key) {
      continue;
    }

    const rows = await sql`
      SELECT
        EXISTS (
          SELECT 1
          FROM campaigns
          WHERE shop_domain = ${shopDomain}
            AND (
              icon_url = ${mediaAssetRow.public_url}
              OR image_url = ${mediaAssetRow.public_url}
              OR windows_image_url = ${mediaAssetRow.public_url}
              OR macos_image_url = ${mediaAssetRow.public_url}
              OR android_image_url = ${mediaAssetRow.public_url}
              OR icon_url LIKE ${`%/api/media/${mediaAssetRow.id}%`}
              OR image_url LIKE ${`%/api/media/${mediaAssetRow.id}%`}
              OR windows_image_url LIKE ${`%/api/media/${mediaAssetRow.id}%`}
              OR macos_image_url LIKE ${`%/api/media/${mediaAssetRow.id}%`}
              OR android_image_url LIKE ${`%/api/media/${mediaAssetRow.id}%`}
            )
        ) AS in_campaigns,
        EXISTS (
          SELECT 1
          FROM merchant_settings
          WHERE shop_domain = ${shopDomain}
            AND (
              opt_in_logo_url = ${mediaAssetRow.public_url}
              OR brand_logo_url = ${mediaAssetRow.public_url}
              OR opt_in_logo_url LIKE ${`%/api/media/${mediaAssetRow.id}%`}
              OR brand_logo_url LIKE ${`%/api/media/${mediaAssetRow.id}%`}
            )
        ) AS in_settings,
        EXISTS (
          SELECT 1
          FROM automation_rules
          WHERE shop_domain = ${shopDomain}
            AND (
              config::text LIKE ${`%${mediaAssetRow.id}%`}
              OR config::text LIKE ${`%${mediaAssetRow.object_key}%`}
              OR (${mediaAssetRow.public_url} IS NOT NULL AND config::text LIKE ${`%${mediaAssetRow.public_url}%`})
            )
        ) AS in_automation_rules
    `;

    const referenceRow = rows[0] as {
      in_campaigns?: boolean;
      in_settings?: boolean;
      in_automation_rules?: boolean;
    } | undefined;

    const stillReferenced = Boolean(
      referenceRow?.in_campaigns || referenceRow?.in_settings || referenceRow?.in_automation_rules,
    );

    if (stillReferenced) {
      continue;
    }

    try {
      await deleteImageFromR2(mediaAssetRow.object_key);
    } catch {
      // Ignore remote delete errors and still prune stale metadata row.
    }

    await sql`
      DELETE FROM media_assets
      WHERE id = ${mediaAssetRow.id}
        AND shop_domain = ${shopDomain}
    `;
  }
};

export const pruneOrphanedMediaAssets = async (shopDomain: string, olderThanMinutes = 60) => {
  await ensureSchema();
  const sql = getNeonSql();
  const safeOlderThanMinutes = Math.max(5, Math.min(Math.floor(olderThanMinutes), 60 * 24 * 30));

  const candidates = await sql`
    SELECT m.id, m.public_url, m.object_key
    FROM media_assets m
    WHERE m.shop_domain = ${shopDomain}
      AND m.object_key IS NOT NULL
      AND m.created_at < NOW() - (${safeOlderThanMinutes} * INTERVAL '1 minute')
      AND NOT EXISTS (
        SELECT 1
        FROM campaigns c
        WHERE c.shop_domain = m.shop_domain
          AND (
            c.icon_url = m.public_url
            OR c.image_url = m.public_url
            OR c.windows_image_url = m.public_url
            OR c.macos_image_url = m.public_url
            OR c.android_image_url = m.public_url
            OR c.icon_url LIKE ('%/api/media/' || m.id || '%')
            OR c.image_url LIKE ('%/api/media/' || m.id || '%')
            OR c.windows_image_url LIKE ('%/api/media/' || m.id || '%')
            OR c.macos_image_url LIKE ('%/api/media/' || m.id || '%')
            OR c.android_image_url LIKE ('%/api/media/' || m.id || '%')
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM merchant_settings s
        WHERE s.shop_domain = m.shop_domain
          AND (
            s.opt_in_logo_url = m.public_url
            OR s.brand_logo_url = m.public_url
            OR s.opt_in_logo_url LIKE ('%/api/media/' || m.id || '%')
            OR s.brand_logo_url LIKE ('%/api/media/' || m.id || '%')
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM automation_rules a
        WHERE a.shop_domain = m.shop_domain
          AND (
            a.config::text LIKE ('%' || m.id || '%')
            OR a.config::text LIKE ('%' || m.object_key || '%')
            OR (m.public_url IS NOT NULL AND a.config::text LIKE ('%' || m.public_url || '%'))
          )
      )
    ORDER BY m.created_at ASC
    LIMIT 50
  `;

  let deletedCount = 0;
  for (const row of candidates as Array<{ id: string; public_url: string | null; object_key: string | null }>) {
    if (!row.object_key) {
      continue;
    }

    try {
      await deleteImageFromR2(String(row.object_key));
    } catch {
      // Ignore remote delete errors and still attempt to prune metadata.
    }

    await sql`
      DELETE FROM media_assets
      WHERE id = ${String(row.id)}
        AND shop_domain = ${shopDomain}
    `;
    deletedCount += 1;
  }

  return { deletedCount };
};

const resolveAutomationDestination = async (shopDomain: string, payload: AutomationJobPayload) => {
  const sql = getNeonSql();
  const rows = await sql`
    SELECT m.primary_domain, m.myshopify_domain, s.brand_logo_url, s.opt_in_logo_url
    FROM merchants m
    LEFT JOIN merchant_settings s ON s.shop_domain = m.shop_domain
    WHERE m.shop_domain = ${shopDomain}
    LIMIT 1
  `;

  const storeBase = toAbsoluteStorefrontUrl(
    rows[0]?.primary_domain ?? rows[0]?.myshopify_domain ?? shopDomain,
    shopDomain,
  );

  const targetUrl = toHttpUrlOrNull(payload.targetUrl ?? null, storeBase) ?? storeBase;

  const fallbackLogo = rows[0]?.brand_logo_url ?? rows[0]?.opt_in_logo_url ?? null;
  const iconUrl = toHttpUrlOrNull(payload.iconUrl ?? null, storeBase)
    ?? toHttpUrlOrNull(fallbackLogo ? String(fallbackLogo) : null, storeBase);
  const imageUrl = toHttpUrlOrNull(payload.imageUrl ?? null, storeBase);
  const windowsImageUrl = toHttpUrlOrNull(payload.windowsImageUrl ?? null, storeBase);
  const macosImageUrl = toHttpUrlOrNull(payload.macosImageUrl ?? null, storeBase);
  const androidImageUrl = toHttpUrlOrNull(payload.androidImageUrl ?? null, storeBase);

  const rawActionButtons = Array.isArray((payload.metadata ?? {}).actionButtons)
    ? ((payload.metadata ?? {}).actionButtons as Array<Record<string, unknown>>)
    : [];
  const actionButtons = rawActionButtons
    .map((button) => {
      const title = String(button.title ?? '').trim();
      const link = toHttpUrlOrNull(String(button.link ?? ''), storeBase);
      if (!title || !link) {
        return null;
      }
      return { title, link };
    })
    .filter((button): button is { title: string; link: string } => Boolean(button));

  return {
    targetUrl,
    iconUrl,
    imageUrl,
    windowsImageUrl,
    macosImageUrl,
    androidImageUrl,
    actionButtons,
  };
};

const selectAutomationImageForDevice = (
  payload: AutomationJobPayload,
  platform: string | null | undefined,
  browser: string | null | undefined,
) => {
  const device = `${String(platform ?? '').toLowerCase()} ${String(browser ?? '').toLowerCase()}`.trim();

  if (device.includes('android')) {
    return payload.androidImageUrl ?? payload.imageUrl ?? null;
  }

  if (device.includes('windows')) {
    return payload.windowsImageUrl ?? payload.imageUrl ?? null;
  }

  if (device.includes('mac') || device.includes('osx') || device.includes('ios') || device.includes('safari')) {
    return payload.macosImageUrl ?? payload.imageUrl ?? null;
  }

  return payload.imageUrl ?? null;
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

const DEFAULT_WELCOME_STEPS: Record<WelcomeStepKey, WelcomeStepConfig> = {
  'reminder-1': {
    enabled: true,
    delayMinutes: 0,
    title: 'You are subscribed',
    body: 'We will keep you posted with latest updates.',
    targetUrl: null,
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [],
  },
  'reminder-2': {
    enabled: true,
    delayMinutes: 3,
    title: "We're glad to have you here!",
    body: "As a subscriber, you'll get our latest offers and products before anyone else.",
    targetUrl: null,
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [{ title: 'Shop now', link: '/collections/all' }],
  },
  'reminder-3': {
    enabled: true,
    delayMinutes: 1440,
    title: 'Anything specific caught your eye?',
    body: 'Our products are made with care, giving you the best value.',
    targetUrl: null,
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [
      { title: 'View products', link: '/collections/all' },
      { title: 'Special offers', link: '/collections/sale' },
    ],
  },
};

const DEFAULT_CART_STEPS: Record<CartStepKey, WelcomeStepConfig> = {
  'cart-reminder-1': {
    enabled: true,
    delayMinutes: 20,
    title: 'You left something behind!',
    body: "We've saved your cart for you. Buy them now before they go out of stock!",
    targetUrl: '/cart',
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [
      { title: 'Checkout', link: '/cart' },
      { title: 'Continue Shopping', link: '/collections/all' },
    ],
  },
  'cart-reminder-2': {
    enabled: true,
    delayMinutes: 120,
    title: 'Still thinking it over?',
    body: 'Your cart is waiting for you. Complete your purchase now and get free shipping on all orders!',
    targetUrl: '/cart',
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [{ title: 'View Cart', link: '/cart' }],
  },
  'cart-reminder-3': {
    enabled: false,
    delayMinutes: 1440,
    title: "Don't miss out!",
    body: "The items in your cart are popular and might sell out soon. Grab them before they're gone!",
    targetUrl: '/cart',
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [{ title: 'Complete Purchase', link: '/cart' }],
  },
};

const DEFAULT_BROWSE_STEPS: Record<BrowseStepKey, WelcomeStepConfig> = {
  'browse-reminder-1': {
    enabled: true,
    delayMinutes: 20,
    title: 'Still interested in this?',
    body: 'We noticed you viewed this product. Take another look before it sells out.',
    targetUrl: null,
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [{ title: 'View Product', link: '/products' }],
  },
  'browse-reminder-2': {
    enabled: false,
    delayMinutes: 120,
    title: 'A special offer for you',
    body: "Here is 10% off the products you viewed. Don't miss out!",
    targetUrl: null,
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [{ title: 'Shop Now', link: '/collections/all' }],
  },
  'browse-reminder-3': {
    enabled: false,
    delayMinutes: 1440,
    title: "Don't let it get away!",
    body: 'The product you viewed is getting a lot of attention. Secure yours before it is gone.',
    targetUrl: null,
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [{ title: 'View Product', link: '/products' }],
  },
};

const DEFAULT_SHIPPING_STEPS: Record<ShippingStepKey, WelcomeStepConfig> = {
  'shipping-1': {
    enabled: true,
    delayMinutes: 0,
    title: 'Your order is on the way',
    body: 'There is a new fulfillment update for your order.',
    targetUrl: '/',
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [{ title: 'Track Package', link: '/' }],
  },
};

const DEFAULT_BACK_IN_STOCK_STEPS: Record<BackInStockStepKey, WelcomeStepConfig> = {
  'stock-1': {
    enabled: true,
    delayMinutes: 0,
    title: 'Back in Stock Alert',
    body: '{{product_name}} is now back in stock. Buy now before it runs out again.',
    targetUrl: '/',
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [{ title: 'Shop Now', link: '/' }],
  },
};

const DEFAULT_PRICE_DROP_STEPS: Record<PriceDropStepKey, WelcomeStepConfig> = {
  'price-1': {
    enabled: true,
    delayMinutes: 0,
    title: 'Price Drop Alert',
    body: '{{product_name}} price dropped from {{subscribed_price}} to {{current_price}}',
    targetUrl: '/',
    iconUrl: null,
    imageUrl: null,
    windowsImageUrl: null,
    macosImageUrl: null,
    androidImageUrl: null,
    actionButtons: [{ title: 'View Item', link: '/' }],
  },
};

const deepCloneStepDefaults = <T extends string>(defaults: Record<T, WelcomeStepConfig>): Record<T, WelcomeStepConfig> => {
  return JSON.parse(JSON.stringify(defaults)) as Record<T, WelcomeStepConfig>;
};

const deepCloneWelcomeDefaults = (): Record<WelcomeStepKey, WelcomeStepConfig> => {
  return deepCloneStepDefaults(DEFAULT_WELCOME_STEPS);
};

const deepCloneCartDefaults = (): Record<CartStepKey, WelcomeStepConfig> => {
  return deepCloneStepDefaults(DEFAULT_CART_STEPS);
};

const deepCloneBrowseDefaults = (): Record<BrowseStepKey, WelcomeStepConfig> => {
  return deepCloneStepDefaults(DEFAULT_BROWSE_STEPS);
};

const deepCloneShippingDefaults = (): Record<ShippingStepKey, WelcomeStepConfig> => {
  return deepCloneStepDefaults(DEFAULT_SHIPPING_STEPS);
};

const deepCloneBackInStockDefaults = (): Record<BackInStockStepKey, WelcomeStepConfig> => {
  return deepCloneStepDefaults(DEFAULT_BACK_IN_STOCK_STEPS);
};

const deepClonePriceDropDefaults = (): Record<PriceDropStepKey, WelcomeStepConfig> => {
  return deepCloneStepDefaults(DEFAULT_PRICE_DROP_STEPS);
};

const toSafeDelayMinutes = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(60 * 24 * 30, Math.floor(parsed)));
};

const normalizeActionButtons = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as Array<{ title: string; link: string }>;
  }

  return value
    .map((item) => {
      const title = String((item as { title?: unknown })?.title ?? '').trim();
      const link = String((item as { link?: unknown })?.link ?? '').trim();
      if (!title || !link) {
        return null;
      }
      return { title, link };
    })
    .filter(Boolean) as Array<{ title: string; link: string }>;
};

const parseSteppedRuleConfig = <T extends string>(
  config: unknown,
  defaultsFactory: () => Record<T, WelcomeStepConfig>,
): { steps: Record<T, WelcomeStepConfig> } => {
  const defaults = defaultsFactory();
  const raw = (config ?? {}) as Record<string, unknown>;
  const rawSteps = (raw.steps ?? {}) as Record<string, unknown>;

  for (const stepKey of Object.keys(defaults) as T[]) {
    const rawStep = (rawSteps[stepKey] ?? {}) as Record<string, unknown>;
    const current = defaults[stepKey];
    defaults[stepKey] = {
      enabled: typeof rawStep.enabled === 'boolean' ? rawStep.enabled : current.enabled,
      delayMinutes: toSafeDelayMinutes(rawStep.delayMinutes, current.delayMinutes),
      title: String(rawStep.title ?? current.title),
      body: String(rawStep.body ?? current.body),
      targetUrl: rawStep.targetUrl == null ? current.targetUrl ?? null : String(rawStep.targetUrl),
      iconUrl: rawStep.iconUrl == null ? current.iconUrl ?? null : String(rawStep.iconUrl),
      imageUrl: rawStep.imageUrl == null ? current.imageUrl ?? null : String(rawStep.imageUrl),
      windowsImageUrl: rawStep.windowsImageUrl == null ? current.windowsImageUrl ?? null : String(rawStep.windowsImageUrl),
      macosImageUrl: rawStep.macosImageUrl == null ? current.macosImageUrl ?? null : String(rawStep.macosImageUrl),
      androidImageUrl: rawStep.androidImageUrl == null ? current.androidImageUrl ?? null : String(rawStep.androidImageUrl),
      actionButtons: normalizeActionButtons(rawStep.actionButtons ?? current.actionButtons ?? []),
    };
  }

  return { steps: defaults };
};

const parseWelcomeRuleConfig = (config: unknown): WelcomeRuleConfig => {
  return parseSteppedRuleConfig(config, deepCloneWelcomeDefaults);
};

const parseCartRuleConfig = (config: unknown): CartRuleConfig => {
  return parseSteppedRuleConfig(config, deepCloneCartDefaults);
};

const parseBrowseRuleConfig = (config: unknown): BrowseRuleConfig => {
  return parseSteppedRuleConfig(config, deepCloneBrowseDefaults);
};

const parseShippingRuleConfig = (config: unknown): ShippingRuleConfig => {
  const raw = (config ?? {}) as Record<string, unknown>;
  const sendWhen = Array.isArray(raw.sendWhen)
    ? raw.sendWhen.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : ['in_transit', 'out_for_delivery', 'delivered'];

  return {
    sendWhen,
    ...parseSteppedRuleConfig(config, deepCloneShippingDefaults),
  };
};

const parseBackInStockRuleConfig = (config: unknown): BackInStockRuleConfig => {
  return parseSteppedRuleConfig(config, deepCloneBackInStockDefaults);
};

const parsePriceDropRuleConfig = (config: unknown): PriceDropRuleConfig => {
  return parseSteppedRuleConfig(config, deepClonePriceDropDefaults);
};

const mergeSteppedRuleConfig = <T extends string>(
  existingConfig: unknown,
  patchConfig: unknown,
  defaultsFactory: () => Record<T, WelcomeStepConfig>,
) => {
  const existing = parseSteppedRuleConfig(existingConfig, defaultsFactory);
  const rawPatch = (patchConfig ?? {}) as Record<string, unknown>;
  const patchSteps = (rawPatch.steps ?? {}) as Record<string, unknown>;
  const mergedSteps = defaultsFactory();

  for (const stepKey of Object.keys(mergedSteps) as T[]) {
    const current = existing.steps[stepKey];
    const patchStep = (patchSteps[stepKey] ?? {}) as Record<string, unknown>;
    mergedSteps[stepKey] = {
      enabled: typeof patchStep.enabled === 'boolean' ? patchStep.enabled : current.enabled,
      delayMinutes: patchStep.delayMinutes == null ? current.delayMinutes : toSafeDelayMinutes(patchStep.delayMinutes, current.delayMinutes),
      title: patchStep.title == null ? current.title : String(patchStep.title),
      body: patchStep.body == null ? current.body : String(patchStep.body),
      targetUrl: patchStep.targetUrl == null ? current.targetUrl ?? null : String(patchStep.targetUrl),
      iconUrl: patchStep.iconUrl == null ? current.iconUrl ?? null : String(patchStep.iconUrl),
      imageUrl: patchStep.imageUrl == null ? current.imageUrl ?? null : String(patchStep.imageUrl),
      windowsImageUrl: patchStep.windowsImageUrl == null ? current.windowsImageUrl ?? null : String(patchStep.windowsImageUrl),
      macosImageUrl: patchStep.macosImageUrl == null ? current.macosImageUrl ?? null : String(patchStep.macosImageUrl),
      androidImageUrl: patchStep.androidImageUrl == null ? current.androidImageUrl ?? null : String(patchStep.androidImageUrl),
      actionButtons: patchStep.actionButtons == null ? normalizeActionButtons(current.actionButtons ?? []) : normalizeActionButtons(patchStep.actionButtons),
    };
  }

  return { steps: mergedSteps };
};

const mergeRuleConfig = (ruleKey: AutomationRuleKey, existingConfig: unknown, patchConfig: unknown) => {
  if (ruleKey === 'welcome_subscriber') {
    return mergeSteppedRuleConfig(existingConfig, patchConfig, deepCloneWelcomeDefaults);
  }

  if (ruleKey === 'cart_abandonment_30m') {
    return mergeSteppedRuleConfig(existingConfig, patchConfig, deepCloneCartDefaults);
  }

  if (ruleKey === 'browse_abandonment_15m') {
    return mergeSteppedRuleConfig(existingConfig, patchConfig, deepCloneBrowseDefaults);
  }

  if (ruleKey === 'shipping_notifications') {
    const rawExisting = (existingConfig ?? {}) as Record<string, unknown>;
    const rawPatch = (patchConfig ?? {}) as Record<string, unknown>;
    return {
      sendWhen: Array.isArray(rawPatch.sendWhen)
        ? rawPatch.sendWhen.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
        : parseShippingRuleConfig(rawExisting).sendWhen,
      ...mergeSteppedRuleConfig(existingConfig, patchConfig, deepCloneShippingDefaults),
    };
  }

  if (ruleKey === 'back_in_stock') {
    return mergeSteppedRuleConfig(existingConfig, patchConfig, deepCloneBackInStockDefaults);
  }

  if (ruleKey === 'price_drop') {
    return mergeSteppedRuleConfig(existingConfig, patchConfig, deepClonePriceDropDefaults);
  }

  return { ...(existingConfig as Record<string, unknown>), ...(patchConfig as Record<string, unknown>) };
};

const DEFAULT_AUTOMATION_RULES: Array<{ key: AutomationRuleKey; enabled: boolean; config: Record<string, unknown> }> = [
  { key: 'welcome_subscriber', enabled: true, config: parseWelcomeRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'browse_abandonment_15m', enabled: true, config: parseBrowseRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'cart_abandonment_30m', enabled: true, config: parseCartRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'checkout_abandonment_30m', enabled: false, config: { delayMinutes: 30 } },
  { key: 'shipping_notifications', enabled: true, config: parseShippingRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'back_in_stock', enabled: true, config: parseBackInStockRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'price_drop', enabled: true, config: parsePriceDropRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'win_back_7d', enabled: false, config: { delayDays: 7 } },
  { key: 'post_purchase_followup', enabled: false, config: { delayDays: 2 } },
];

const ensureAutomationRules = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(shopDomain);

  for (const rule of DEFAULT_AUTOMATION_RULES) {
    await sql`
      INSERT INTO automation_rules (id, shop_domain, rule_key, enabled, config)
      VALUES (${randomUUID()}, ${shopDomain}, ${rule.key}, ${rule.enabled}, ${JSON.stringify(rule.config)}::jsonb)
      ON CONFLICT (shop_domain, rule_key) DO NOTHING
    `;
  }

  const welcomeRows = await sql`
    SELECT config
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
    LIMIT 1
  `;

  const welcomeConfig = (welcomeRows[0]?.config ?? {}) as Record<string, unknown>;
  const hasSteps = Boolean((welcomeConfig.steps as Record<string, unknown> | undefined));
  if (!hasSteps) {
    const normalized = parseWelcomeRuleConfig(welcomeConfig);
    await sql`
      UPDATE automation_rules
      SET config = ${JSON.stringify(normalized)}::jsonb,
          updated_at = NOW()
      WHERE shop_domain = ${shopDomain}
        AND rule_key = 'welcome_subscriber'
    `;
  }

  const cartRows = await sql`
    SELECT config
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'cart_abandonment_30m'
    LIMIT 1
  `;

  const cartConfig = (cartRows[0]?.config ?? {}) as Record<string, unknown>;
  const hasCartSteps = Boolean((cartConfig.steps as Record<string, unknown> | undefined));
  if (!hasCartSteps) {
    const normalized = parseCartRuleConfig(cartConfig);
    await sql`
      UPDATE automation_rules
      SET config = ${JSON.stringify(normalized)}::jsonb,
          updated_at = NOW()
      WHERE shop_domain = ${shopDomain}
        AND rule_key = 'cart_abandonment_30m'
    `;
  }

  const browseRows = await sql`
    SELECT config
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'browse_abandonment_15m'
    LIMIT 1
  `;

  const browseConfig = (browseRows[0]?.config ?? {}) as Record<string, unknown>;
  const hasBrowseSteps = Boolean((browseConfig.steps as Record<string, unknown> | undefined));
  if (!hasBrowseSteps) {
    const normalized = parseBrowseRuleConfig(browseConfig);
    await sql`
      UPDATE automation_rules
      SET config = ${JSON.stringify(normalized)}::jsonb,
          updated_at = NOW()
      WHERE shop_domain = ${shopDomain}
        AND rule_key = 'browse_abandonment_15m'
    `;
  }

  const shippingRows = await sql`
    SELECT config
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'shipping_notifications'
    LIMIT 1
  `;

  const shippingConfig = (shippingRows[0]?.config ?? {}) as Record<string, unknown>;
  const hasShippingSteps = Boolean((shippingConfig.steps as Record<string, unknown> | undefined));
  if (!hasShippingSteps) {
    const normalized = parseShippingRuleConfig(shippingConfig);
    await sql`
      UPDATE automation_rules
      SET config = ${JSON.stringify(normalized)}::jsonb,
          updated_at = NOW()
      WHERE shop_domain = ${shopDomain}
        AND rule_key = 'shipping_notifications'
    `;
  }

  const backInStockRows = await sql`
    SELECT config
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'back_in_stock'
    LIMIT 1
  `;

  const backInStockConfig = (backInStockRows[0]?.config ?? {}) as Record<string, unknown>;
  const hasBackInStockSteps = Boolean((backInStockConfig.steps as Record<string, unknown> | undefined));
  if (!hasBackInStockSteps) {
    const normalized = parseBackInStockRuleConfig(backInStockConfig);
    await sql`
      UPDATE automation_rules
      SET config = ${JSON.stringify(normalized)}::jsonb,
          updated_at = NOW()
      WHERE shop_domain = ${shopDomain}
        AND rule_key = 'back_in_stock'
    `;
  }

  const priceDropRows = await sql`
    SELECT config
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'price_drop'
    LIMIT 1
  `;

  const priceDropConfig = (priceDropRows[0]?.config ?? {}) as Record<string, unknown>;
  const hasPriceDropSteps = Boolean((priceDropConfig.steps as Record<string, unknown> | undefined));
  if (!hasPriceDropSteps) {
    const normalized = parsePriceDropRuleConfig(priceDropConfig);
    await sql`
      UPDATE automation_rules
      SET config = ${JSON.stringify(normalized)}::jsonb,
          updated_at = NOW()
      WHERE shop_domain = ${shopDomain}
        AND rule_key = 'price_drop'
    `;
  }
};

export const listAutomationRules = async (shopDomain: string) => {
  await ensureAutomationRules(shopDomain);
  const sql = getNeonSql();

  const rows = await sql`
    SELECT id, rule_key, enabled, config, updated_at
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
    ORDER BY rule_key ASC
  `;

  return rows.map((row) => ({
    id: String(row.id),
    ruleKey: String(row.rule_key),
    enabled: Boolean(row.enabled),
    config: (row.config ?? {}) as Record<string, unknown>,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }));
};

export const upsertAutomationRule = async (
  shopDomain: string,
  ruleKey: AutomationRuleKey,
  enabled?: boolean,
  config?: Record<string, unknown>,
) => {
  await ensureAutomationRules(shopDomain);
  const sql = getNeonSql();

  const currentRows = await sql`
    SELECT enabled, config
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = ${ruleKey}
    LIMIT 1
  `;

  if (!currentRows[0]) {
    return null;
  }

  const currentEnabled = Boolean(currentRows[0]?.enabled);
  const currentConfig = (currentRows[0]?.config ?? {}) as Record<string, unknown>;
  const currentMediaRefs = collectMediaReferences(currentConfig);
  const nextEnabled = typeof enabled === 'boolean' ? enabled : currentEnabled;
  const nextConfig = config === undefined ? currentConfig : mergeRuleConfig(ruleKey, currentConfig, config);
  const nextMediaRefs = collectMediaReferences(nextConfig);

  const rows = await sql`
    UPDATE automation_rules
    SET enabled = ${nextEnabled}, config = ${JSON.stringify(nextConfig)}::jsonb, updated_at = NOW()
    WHERE shop_domain = ${shopDomain}
      AND rule_key = ${ruleKey}
    RETURNING id, rule_key, enabled, config, updated_at
  `;

  const row = rows[0];
  const removedMediaRefs = [...currentMediaRefs].filter((url) => !nextMediaRefs.has(url));
  if (removedMediaRefs.length > 0) {
    await cleanupUnusedMediaAssets(shopDomain, removedMediaRefs);
  }

  return row
    ? {
        id: String(row.id),
        ruleKey: String(row.rule_key),
        enabled: Boolean(row.enabled),
        config: (row.config ?? {}) as Record<string, unknown>,
        updatedAt: row.updated_at ? String(row.updated_at) : null,
      }
    : null;
};

export const getAutomationOverview = async (shopDomain: string) => {
  await ensureAutomationRules(shopDomain);
  const sql = getNeonSql();

  const [rules, deliveryStats, clickStats] = await Promise.all([
    listAutomationRules(shopDomain),
    sql`
      SELECT
        rule_key,
        COUNT(*)::BIGINT AS impressions,
        COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
      FROM automation_deliveries
      WHERE shop_domain = ${shopDomain}
      GROUP BY rule_key
    `,
    sql`
      SELECT
        rule_key,
        COUNT(*)::BIGINT AS clicks,
        COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
      FROM automation_clicks
      WHERE shop_domain = ${shopDomain}
      GROUP BY rule_key
    `,
  ]);

  const deliveriesByRule = new Map(
    deliveryStats.map((row) => [String(row.rule_key), {
      impressions: Number(row.impressions ?? 0),
      revenueCents: Number(row.revenue_cents ?? 0),
    }]),
  );
  const clicksByRule = new Map(
    clickStats.map((row) => [String(row.rule_key), {
      clicks: Number(row.clicks ?? 0),
      revenueCents: Number(row.revenue_cents ?? 0),
    }]),
  );

  const summaries = rules.map((rule) => {
    const delivery = deliveriesByRule.get(rule.ruleKey) ?? { impressions: 0, revenueCents: 0 };
    const click = clicksByRule.get(rule.ruleKey) ?? { clicks: 0, revenueCents: 0 };
    return {
      ...rule,
      impressions: delivery.impressions,
      clicks: click.clicks,
      revenueCents: delivery.revenueCents + click.revenueCents,
    };
  });

  return {
    totals: summaries.reduce(
      (acc, rule) => ({
        impressions: acc.impressions + rule.impressions,
        clicks: acc.clicks + rule.clicks,
        revenueCents: acc.revenueCents + rule.revenueCents,
      }),
      { impressions: 0, clicks: 0, revenueCents: 0 },
    ),
    rules: summaries,
  };
};

const buildProductUrl = (handle?: string | null) => {
  const normalized = String(handle ?? '').trim();
  return normalized ? `/products/${normalized}` : null;
};

const getRuleConfig = async (shopDomain: string, ruleKey: AutomationRuleKey) => {
  const sql = getNeonSql();
  const rows = await sql`
    SELECT enabled, config
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = ${ruleKey}
    LIMIT 1
  `;

  return {
    enabled: Boolean(rows[0]?.enabled),
    config: (rows[0]?.config ?? {}) as Record<string, unknown>,
  };
};

const listAutomationTargets = async (input: { shopDomain: string; externalId?: string | null; subscriberId?: number | null }) => {
  const sql = getNeonSql();

  if (!input.externalId && !input.subscriberId) {
    return [] as Array<{ tokenId: number; subscriberId: number | null; externalId: string | null }>;
  }

  // Keep only the most recently seen active token per subscriber to prevent duplicate sends.
  const rows = input.subscriberId
    ? await sql`
      WITH ranked AS (
        SELECT
          t.id AS token_id,
          s.id AS subscriber_id,
          s.external_id,
          ROW_NUMBER() OVER (
            PARTITION BY s.id
            ORDER BY t.last_seen_at DESC NULLS LAST, t.updated_at DESC, t.id DESC
          ) AS rn
        FROM subscriber_tokens t
        JOIN subscribers s ON s.id = t.subscriber_id
        WHERE t.shop_domain = ${input.shopDomain}
          AND s.id = ${input.subscriberId}
          AND t.status = 'active'
      )
      SELECT token_id, subscriber_id, external_id
      FROM ranked
      WHERE rn = 1
    `
    : await sql`
      WITH ranked AS (
        SELECT
          t.id AS token_id,
          s.id AS subscriber_id,
          s.external_id,
          ROW_NUMBER() OVER (
            PARTITION BY s.id
            ORDER BY t.last_seen_at DESC NULLS LAST, t.updated_at DESC, t.id DESC
          ) AS rn
        FROM subscriber_tokens t
        JOIN subscribers s ON s.id = t.subscriber_id
        WHERE t.shop_domain = ${input.shopDomain}
          AND s.external_id = ${input.externalId ?? ''}
          AND t.status = 'active'
      )
      SELECT token_id, subscriber_id, external_id
      FROM ranked
      WHERE rn = 1
    `;

  return rows.map((row) => ({
    tokenId: Number(row.token_id),
    subscriberId: row.subscriber_id ? Number(row.subscriber_id) : null,
    externalId: row.external_id ? String(row.external_id) : null,
  }));
};

const enqueueAutomationForTargets = async (input: {
  shopDomain: string;
  ruleKey: AutomationRuleKey;
  targets: Array<{ tokenId: number; subscriberId: number | null }>;
  dedupeKeyBase: string;
  dueAt?: Date;
  payload: AutomationJobPayload;
}) => {
  for (const target of input.targets) {
    await enqueueAutomationJob({
      shopDomain: input.shopDomain,
      ruleKey: input.ruleKey,
      tokenId: target.tokenId,
      subscriberId: target.subscriberId,
      dedupeKey: `${input.dedupeKeyBase}:${target.tokenId}`,
      dueAt: input.dueAt,
      payload: {
        ...input.payload,
        ruleKey: input.ruleKey,
      },
    });
  }
};

const hasRecentActivity = async (input: {
  shopDomain: string;
  externalId?: string | null;
  since?: string | null;
  eventTypes: string[];
  productId?: string | null;
  cartToken?: string | null;
}) => {
  if (!input.externalId || !input.since || input.eventTypes.length === 0) {
    return false;
  }

  const sql = getNeonSql();
  const rows = await sql`
    SELECT id
    FROM subscriber_activity_events
    WHERE shop_domain = ${input.shopDomain}
      AND external_id = ${input.externalId}
      AND event_type = ANY(${input.eventTypes})
      AND created_at > ${new Date(input.since)}
      AND (
        (${input.productId ?? null} IS NULL AND ${input.cartToken ?? null} IS NULL)
        OR (${input.productId ?? null} IS NOT NULL AND product_id = ${input.productId ?? null})
        OR (${input.cartToken ?? null} IS NOT NULL AND cart_token = ${input.cartToken ?? null})
      )
    LIMIT 1
  `;

  return rows.length > 0;
};

const hasRecentOrder = async (input: {
  shopDomain: string;
  externalId?: string | null;
  customerId?: string | null;
  since?: string | null;
}) => {
  if (!input.since || (!input.externalId && !input.customerId)) {
    return false;
  }

  const sql = getNeonSql();
  const rows = await sql`
    SELECT id
    FROM shopify_orders
    WHERE shop_domain = ${input.shopDomain}
      AND created_at > ${new Date(input.since)}
      AND (
        (${input.externalId ?? null} IS NOT NULL AND external_id = ${input.externalId ?? null})
        OR (${input.customerId ?? null} IS NOT NULL AND customer_id = ${input.customerId ?? null})
      )
    LIMIT 1
  `;

  return rows.length > 0;
};

const getAutomationSkipReason = async (shopDomain: string, payload: AutomationJobPayload) => {
  const ruleKey = payload.ruleKey ?? null;
  const triggeredAt = payload.triggeredAt ?? null;

  if (!ruleKey || !triggeredAt) {
    return null;
  }

  if (ruleKey === 'browse_abandonment_15m') {
    const resumedJourney = await hasRecentActivity({
      shopDomain,
      externalId: payload.externalId,
      since: triggeredAt,
      eventTypes: ['add_to_cart', 'checkout_start'],
      productId: payload.productId ?? null,
    });
    if (resumedJourney || (await hasRecentOrder({ shopDomain, externalId: payload.externalId, customerId: payload.customerId, since: triggeredAt }))) {
      return 'Subscriber already resumed purchase journey.';
    }
  }

  if (ruleKey === 'cart_abandonment_30m') {
    const advancedCheckout = await hasRecentActivity({
      shopDomain,
      externalId: payload.externalId,
      since: triggeredAt,
      eventTypes: ['checkout_start'],
      productId: payload.productId ?? null,
      cartToken: payload.cartToken ?? null,
    });
    if (advancedCheckout || (await hasRecentOrder({ shopDomain, externalId: payload.externalId, customerId: payload.customerId, since: triggeredAt }))) {
      return 'Subscriber already moved past cart stage.';
    }
  }

  if (ruleKey === 'checkout_abandonment_30m' || ruleKey === 'win_back_7d') {
    if (await hasRecentOrder({ shopDomain, externalId: payload.externalId, customerId: payload.customerId, since: triggeredAt })) {
      return 'Subscriber already placed a newer order.';
    }
  }

  return null;
};

const listInterestedExternalIdsForProduct = async (shopDomain: string, productIdentifiers: string[]) => {
  if (productIdentifiers.length === 0) {
    return [] as string[];
  }

  const sql = getNeonSql();
  const rows = await sql`
    SELECT DISTINCT external_id
    FROM subscriber_activity_events
    WHERE shop_domain = ${shopDomain}
      AND event_type = ANY(${['product_view', 'add_to_cart']})
      AND product_id = ANY(${productIdentifiers})
      AND created_at >= NOW() - INTERVAL '30 days'
    ORDER BY external_id ASC
    LIMIT 500
  `;

  return rows.map((row) => String(row.external_id)).filter(Boolean);
};

const enqueueProductInterestAutomation = async (input: {
  shopDomain: string;
  ruleKey: AutomationRuleKey;
  productIdentifiers: string[];
  dedupeKeySeed: string;
  payload: AutomationJobPayload;
}) => {
  const externalIds = await listInterestedExternalIdsForProduct(input.shopDomain, input.productIdentifiers);

  for (const externalId of externalIds) {
    const targets = await listAutomationTargets({
      shopDomain: input.shopDomain,
      externalId,
    });

    if (targets.length === 0) {
      continue;
    }

    await enqueueAutomationForTargets({
      shopDomain: input.shopDomain,
      ruleKey: input.ruleKey,
      targets,
      dedupeKeyBase: `${input.dedupeKeySeed}:${externalId}`,
      payload: {
        ...input.payload,
        externalId,
        triggeredAt: input.payload.triggeredAt ?? new Date().toISOString(),
      },
    });
  }
};

export const pruneAutomationData = async () => {
  await ensureSchema();
  const sql = getNeonSql();

  await sql`
    DELETE FROM webhook_events
    WHERE received_at < NOW() - INTERVAL '30 days'
  `;

  await sql`
    DELETE FROM subscriber_activity_events
    WHERE created_at < NOW() - INTERVAL '45 days'
  `;

  await sql`
    DELETE FROM automation_jobs
    WHERE status IN ('sent', 'failed', 'skipped')
      AND updated_at < NOW() - INTERVAL '60 days'
  `;
};

export const enqueueAutomationJob = async (input: {
  shopDomain: string;
  ruleKey: AutomationRuleKey;
  tokenId?: number | null;
  subscriberId?: number | null;
  dedupeKey?: string | null;
  dueAt?: Date;
  payload: AutomationJobPayload;
}) => {
  await ensureSchema();
  const sql = getNeonSql();

  const jobId = randomUUID();
  const dueAt = input.dueAt ?? new Date();

  if (input.dedupeKey) {
    await sql`
      DELETE FROM automation_jobs
      WHERE shop_domain = ${input.shopDomain}
        AND dedupe_key = ${input.dedupeKey}
        AND status IN ('failed', 'skipped')
    `;
  }

  const rows = await sql`
    INSERT INTO automation_jobs (id, shop_domain, rule_key, token_id, subscriber_id, dedupe_key, payload, due_at)
    VALUES (
      ${jobId},
      ${input.shopDomain},
      ${input.ruleKey},
      ${input.tokenId ?? null},
      ${input.subscriberId ?? null},
      ${input.dedupeKey ?? null},
      ${JSON.stringify(input.payload)}::jsonb,
      ${dueAt}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  return rows[0] ? String(rows[0].id) : null;
};

/**
 * Immediately process the pending welcome_subscriber job for the given tokenId.
 * Called right after upsertSubscriberToken so the welcome notification fires
 * instantly without waiting for the next cron cycle.
 */
export const dispatchWelcomeJobNow = async (shopDomain: string, tokenId: number) => {
  const sql = getNeonSql();

  const jobRows = await sql`
    SELECT id
    FROM automation_jobs
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
      AND token_id = ${tokenId}
      AND status = 'pending'
      AND due_at <= NOW() + INTERVAL '5 seconds'
    ORDER BY due_at ASC, created_at ASC
    LIMIT 20
  `;

  if (!jobRows.length) {
    return { dispatched: false };
  }

  const results = await Promise.all(
    jobRows.map((row) => processAutomationJob(String(row.id))),
  );

  return {
    dispatched: true,
    processedCount: results.filter((item) => item.processed).length,
    failedCount: results.filter((item) => !item.processed && item.error).length,
  };
};

export const enqueueIngestionJob = async (input: {
  shopDomain: string;
  jobType: IngestionJobType;
  payload: PixelIngestionPayload | OrderCreateIngestionPayload;
  dedupeKey?: string | null;
  dueAt?: Date;
}) => {
  await ensureSchema();
  const sql = getNeonSql();

  const jobId = randomUUID();
  const dueAt = input.dueAt ?? new Date();

  const rows = await sql`
    INSERT INTO ingestion_jobs (id, shop_domain, job_type, dedupe_key, payload, due_at)
    VALUES (
      ${jobId},
      ${input.shopDomain},
      ${input.jobType},
      ${input.dedupeKey ?? null},
      ${JSON.stringify(input.payload)}::jsonb,
      ${dueAt}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  return rows[0] ? String(rows[0].id) : null;
};

export const listDueIngestionJobs = async (limit = 500, shardCount = 1, shardIndex = 0) => {
  await ensureSchema();
  const sql = getNeonSql();
  const safeShardCount = Math.max(1, Math.min(Number(shardCount) || 1, 128));
  const safeShardIndex = Math.max(0, Math.min(Number(shardIndex) || 0, safeShardCount - 1));

  const rows = await sql`
    SELECT id, shop_domain, job_type, payload
    FROM ingestion_jobs
    WHERE status = 'pending'
      AND due_at <= NOW()
      AND (
        ${safeShardCount} = 1
        OR MOD(ABS(hashtext(id)), ${safeShardCount}) = ${safeShardIndex}
      )
    ORDER BY due_at ASC
    LIMIT ${limit}
  `;

  return rows as Array<{ id: string; shop_domain: string; job_type: string; payload: unknown }>;
};

const getCampaignIdFromLandingSite = (landingSite: string | null | undefined) => {
  if (!landingSite) {
    return null;
  }

  try {
    const url = new URL(landingSite);
    return url.searchParams.get('utm_campaign');
  } catch {
    return null;
  }
};

export const processIngestionJob = async (jobId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const claimRows = await sql`
    UPDATE ingestion_jobs
    SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
    WHERE id = ${jobId}
      AND status = 'pending'
    RETURNING id, shop_domain, job_type, payload
  `;

  const claim = claimRows[0] as
    | { id: string; shop_domain: string; job_type: string; payload: unknown }
    | undefined;
  if (!claim) {
    return { processed: false };
  }

  try {
    if (claim.job_type === 'pixel_event') {
      const payload = claim.payload as PixelIngestionPayload;

      const pixelEventId = await recordPixelEvent({
        shopDomain: payload.shopDomain,
        externalId: payload.externalId,
        eventType: payload.eventType,
        pageUrl: payload.pageUrl,
        productId: payload.productId,
        cartToken: payload.cartToken,
        clientId: payload.clientId,
        metadata: payload.metadata,
      });

      await recordSubscriberActivity({
        shopDomain: payload.shopDomain,
        externalId: payload.externalId,
        eventType: payload.eventType,
        pageUrl: payload.pageUrl,
        productId: payload.productId,
        cartToken: payload.cartToken,
        metadata: {
          ...(payload.metadata ?? {}),
          pixelEventId,
        },
      });
    } else if (claim.job_type === 'shopify_order_create') {
      const payload = claim.payload as OrderCreateIngestionPayload;

      await upsertShopifyCustomer({
        shopDomain: payload.shopDomain,
        customerId: payload.customerId ?? null,
        email: payload.email ?? null,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        externalId: payload.externalId ?? null,
        tags: payload.customerTags ?? null,
      });

      await upsertShopifyOrderEvent({
        shopDomain: payload.shopDomain,
        orderId: payload.orderId,
        externalId: payload.externalId ?? null,
        customerId: payload.customerId ?? null,
        email: payload.email ?? null,
        totalPriceCents: payload.totalPriceCents,
        createdAt: payload.createdAt ?? null,
        lineItems: payload.lineItems ?? [],
      });

      await recordAttributedConversion({
        shopDomain: payload.shopDomain,
        orderId: payload.orderId,
        revenueCents: payload.totalPriceCents,
        occurredAt: payload.createdAt ?? null,
        externalId: payload.externalId ?? null,
        customerId: payload.customerId ?? null,
        email: payload.email ?? null,
        campaignId: getCampaignIdFromLandingSite(payload.landingSite),
        userAgent: payload.userAgent ?? null,
        browser: payload.userAgent ?? null,
        country: null,
      });
    }

    await sql`
      UPDATE ingestion_jobs
      SET status = 'processed', processed_at = NOW(), error_message = NULL, updated_at = NOW()
      WHERE id = ${jobId}
    `;

    return { processed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process ingestion job.';

    await sql`
      UPDATE ingestion_jobs
      SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
          error_message = ${message},
          due_at = CASE WHEN attempts >= 5 THEN due_at ELSE NOW() + INTERVAL '2 minutes' END,
          updated_at = NOW()
      WHERE id = ${jobId}
    `;

    return { processed: false, error: message };
  }
};

export const processIngestionQueue = async (input?: {
  limit?: number;
  maxConcurrent?: number;
  shardCount?: number;
  shardIndex?: number;
}) => {
  const limit = Math.max(1, Math.min(Number(input?.limit ?? 500), 5000));
  const maxConcurrent = Math.max(1, Math.min(Number(input?.maxConcurrent ?? 50), 200));
  const shardCount = Math.max(1, Math.min(Number(input?.shardCount ?? 1), 128));
  const shardIndex = Math.max(0, Math.min(Number(input?.shardIndex ?? 0), shardCount - 1));

  const jobs = await listDueIngestionJobs(limit, shardCount, shardIndex);
  const processed = [] as Array<{ jobId: string; processed: boolean; error?: string }>;

  for (let index = 0; index < jobs.length; index += maxConcurrent) {
    const chunk = jobs.slice(index, index + maxConcurrent);
    const results = await Promise.all(
      chunk.map(async (job) => {
        const result = await processIngestionJob(String(job.id));
        return {
          jobId: String(job.id),
          processed: Boolean(result.processed),
          error: result.error,
        };
      }),
    );
    processed.push(...results);
  }

  return {
    dueJobs: jobs.length,
    processed,
    processedCount: processed.filter((item) => item.processed).length,
    failedCount: processed.filter((item) => !item.processed && item.error).length,
  };
};

export const listDueAutomationJobs = async (limit = 100, shardCount = 1, shardIndex = 0) => {
  await ensureSchema();
  const sql = getNeonSql();
  const safeShardCount = Math.max(1, Math.min(Number(shardCount) || 1, 128));
  const safeShardIndex = Math.max(0, Math.min(Number(shardIndex) || 0, safeShardCount - 1));

  // If a worker crashed mid-flight, move stale processing jobs back to pending.
  await sql`
    UPDATE automation_jobs
    SET status = 'pending', updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < NOW() - INTERVAL '10 minutes'
  `;

  const rows = await sql`
    SELECT j.id, j.shop_domain, j.rule_key, j.token_id, j.subscriber_id, j.payload, t.fcm_token
    FROM automation_jobs j
    LEFT JOIN subscriber_tokens t ON t.id = j.token_id
    WHERE j.status = 'pending'
      AND j.due_at <= NOW()
      AND (
        ${safeShardCount} = 1
        OR MOD(ABS(hashtext(j.id)), ${safeShardCount}) = ${safeShardIndex}
      )
    ORDER BY j.due_at ASC
    LIMIT ${limit}
  `;

  return rows as Array<{
    id: string;
    shop_domain: string;
    rule_key: string;
    token_id: number | null;
    subscriber_id: number | null;
    payload: AutomationJobPayload;
    fcm_token: string | null;
  }>;
};

export const processDueAutomationJobsForShop = async (shopDomain: string, limit = 50, maxConcurrent = 10) => {
  await ensureSchema();
  const sql = getNeonSql();

  const jobs = await sql`
    SELECT id
    FROM automation_jobs
    WHERE shop_domain = ${shopDomain}
      AND status = 'pending'
      AND due_at <= NOW()
    ORDER BY due_at ASC
    LIMIT ${limit}
  `;

  const processed = [] as Array<{ jobId: string; processed: boolean; error?: string }>;

  for (let index = 0; index < jobs.length; index += maxConcurrent) {
    const chunk = jobs.slice(index, index + maxConcurrent);
    const chunkResults = await Promise.all(
      chunk.map(async (job) => {
        const jobId = String(job.id);
        const result = await processAutomationJob(jobId);
        return { jobId, processed: Boolean(result.processed), error: result.error };
      }),
    );

    processed.push(...chunkResults);
  }

  return {
    dueJobs: jobs.length,
    sentCount: processed.filter((item) => item.processed).length,
    failedCount: processed.filter((item) => !item.processed && item.error).length,
    processed,
  };
};

export const processAutomationJob = async (jobId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const claimRows = await sql`
    UPDATE automation_jobs
    SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
    WHERE id = ${jobId}
      AND status = 'pending'
    RETURNING id, shop_domain, rule_key, token_id, subscriber_id, payload
  `;

  const claim = claimRows[0] as
    | { id: string; shop_domain: string; rule_key: string; token_id: number | null; subscriber_id: number | null; payload: AutomationJobPayload }
    | undefined;
  if (!claim) {
    return { processed: false };
  }

  const tokenRows = await sql`
    SELECT fcm_token, token_type, vapid_endpoint, vapid_p256dh, vapid_auth, status
    FROM subscriber_tokens
    WHERE id = ${claim.token_id ?? 0}
    LIMIT 1
  `;
  let activeTokenRow = tokenRows[0];
  let token = String(activeTokenRow?.fcm_token ?? '');
  let tokenType = String(activeTokenRow?.token_type ?? 'fcm');
  let tokenStatus = String(activeTokenRow?.status ?? '');
  let deliveryTokenId = claim.token_id ?? null;

  if ((!token || tokenStatus !== 'active') && claim.subscriber_id) {
    const fallbackTokenRows = await sql`
      SELECT id, fcm_token, token_type, vapid_endpoint, vapid_p256dh, vapid_auth, status
      FROM subscriber_tokens
      WHERE shop_domain = ${claim.shop_domain}
        AND subscriber_id = ${claim.subscriber_id}
        AND status = 'active'
      ORDER BY last_seen_at DESC NULLS LAST, updated_at DESC
      LIMIT 1
    `;

    if (fallbackTokenRows[0]) {
      activeTokenRow = fallbackTokenRows[0];
      token = String(activeTokenRow?.fcm_token ?? '');
      tokenType = String(activeTokenRow?.token_type ?? 'fcm');
      tokenStatus = String(activeTokenRow?.status ?? '');
      deliveryTokenId = Number(fallbackTokenRows[0]?.id ?? 0) || deliveryTokenId;
    }
  }

  if ((!token || tokenStatus !== 'active') && claim.payload?.externalId) {
    const fallbackByExternalRows = await sql`
      SELECT t.id, t.fcm_token, t.token_type, t.vapid_endpoint, t.vapid_p256dh, t.vapid_auth, t.status
      FROM subscriber_tokens t
      JOIN subscribers s ON s.id = t.subscriber_id
      WHERE t.shop_domain = ${claim.shop_domain}
        AND s.external_id = ${String(claim.payload.externalId)}
        AND t.status = 'active'
      ORDER BY t.last_seen_at DESC NULLS LAST, t.updated_at DESC
      LIMIT 1
    `;

    if (fallbackByExternalRows[0]) {
      activeTokenRow = fallbackByExternalRows[0];
      token = String(activeTokenRow?.fcm_token ?? '');
      tokenType = String(activeTokenRow?.token_type ?? 'fcm');
      tokenStatus = String(activeTokenRow?.status ?? '');
      deliveryTokenId = Number(fallbackByExternalRows[0]?.id ?? 0) || deliveryTokenId;
    }
  }

  if (!token || tokenStatus !== 'active') {
    await sql`
      UPDATE automation_jobs
      SET status = 'failed', error_message = 'Missing active token.', updated_at = NOW()
      WHERE id = ${jobId}
    `;
    return { processed: false, error: 'Missing active token.' };
  }

  try {
    let payload = claim.payload ?? { title: 'Notification', body: '' };
    let subscriberPlatform: string | null = null;
    let subscriberBrowser: string | null = null;

    if (claim.subscriber_id) {
      const subscriberRows = await sql`
        SELECT platform, browser
        FROM subscribers
        WHERE id = ${claim.subscriber_id}
        LIMIT 1
      `;
      subscriberPlatform = subscriberRows[0]?.platform == null ? null : String(subscriberRows[0].platform);
      subscriberBrowser = subscriberRows[0]?.browser == null ? null : String(subscriberRows[0].browser);
    } else if (payload.externalId) {
      const subscriberRows = await sql`
        SELECT platform, browser
        FROM subscribers
        WHERE shop_domain = ${claim.shop_domain}
          AND external_id = ${String(payload.externalId)}
        LIMIT 1
      `;
      subscriberPlatform = subscriberRows[0]?.platform == null ? null : String(subscriberRows[0].platform);
      subscriberBrowser = subscriberRows[0]?.browser == null ? null : String(subscriberRows[0].browser);
    }

    const ruleRows = await sql`
      SELECT enabled, config
      FROM automation_rules
      WHERE shop_domain = ${claim.shop_domain}
        AND rule_key = ${claim.rule_key}
      LIMIT 1
    `;

    if (!Boolean(ruleRows[0]?.enabled)) {
      await sql`
        UPDATE automation_jobs
        SET status = 'skipped', error_message = 'Automation rule is disabled.', updated_at = NOW()
        WHERE id = ${jobId}
      `;
      return { processed: false, error: 'Automation rule is disabled.' };
    }

    const payloadMetadata = (payload.metadata ?? {}) as Record<string, unknown>;
    const payloadStepKey = payloadMetadata.stepKey == null ? '' : String(payloadMetadata.stepKey);

    if (claim.rule_key === 'welcome_subscriber' && payloadStepKey) {
      const welcomeConfig = parseWelcomeRuleConfig(ruleRows[0]?.config ?? null);
      const step = welcomeConfig.steps[payloadStepKey as WelcomeStepKey];

      if (!step?.enabled) {
        await sql`
          UPDATE automation_jobs
          SET status = 'skipped', error_message = 'Welcome reminder step is disabled.', updated_at = NOW()
          WHERE id = ${jobId}
        `;
        return { processed: false, error: 'Welcome reminder step is disabled.' };
      }

      payload = {
        ...payload,
        title: step.title,
        body: step.body,
        targetUrl: step.targetUrl ?? payload.targetUrl ?? null,
        iconUrl: step.iconUrl ?? payload.iconUrl ?? null,
        imageUrl: step.imageUrl ?? payload.imageUrl ?? null,
        windowsImageUrl: step.windowsImageUrl ?? payload.windowsImageUrl ?? null,
        macosImageUrl: step.macosImageUrl ?? payload.macosImageUrl ?? null,
        androidImageUrl: step.androidImageUrl ?? payload.androidImageUrl ?? null,
        metadata: {
          ...(payload.metadata ?? {}),
          stepKey: payloadStepKey,
          actionButtons: step.actionButtons ?? [],
        },
      };

      const payloadExternalId = payload.externalId == null ? '' : String(payload.externalId);
      if (payloadExternalId) {
        const canonicalWelcomeRows = await sql`
          SELECT id
          FROM automation_jobs
          WHERE shop_domain = ${claim.shop_domain}
            AND rule_key = 'welcome_subscriber'
            AND payload ->> 'externalId' = ${payloadExternalId}
            AND payload -> 'metadata' ->> 'stepKey' = ${payloadStepKey}
            AND status IN ('pending', 'processing', 'sent')
          ORDER BY created_at ASC
          LIMIT 1
        `;

        const canonicalWelcomeJobId = canonicalWelcomeRows[0]?.id == null ? '' : String(canonicalWelcomeRows[0].id);
        if (canonicalWelcomeJobId && canonicalWelcomeJobId !== claim.id) {
          await sql`
            UPDATE automation_jobs
            SET status = 'skipped', error_message = 'Duplicate welcome reminder job suppressed.', updated_at = NOW()
            WHERE id = ${jobId}
          `;
          return { processed: false, error: 'Duplicate welcome reminder job suppressed.' };
        }

        const existingDeliveryRows = await sql`
          SELECT d.automation_job_id
          FROM automation_deliveries d
          JOIN automation_jobs j ON j.id = d.automation_job_id
          WHERE d.shop_domain = ${claim.shop_domain}
            AND d.rule_key = 'welcome_subscriber'
            AND d.external_id = ${payloadExternalId}
            AND j.payload -> 'metadata' ->> 'stepKey' = ${payloadStepKey}
          ORDER BY d.delivered_at DESC
          LIMIT 1
        `;

        const existingDeliveryJobId = existingDeliveryRows[0]?.automation_job_id == null ? '' : String(existingDeliveryRows[0].automation_job_id);
        if (existingDeliveryJobId && existingDeliveryJobId !== claim.id) {
          await sql`
            UPDATE automation_jobs
            SET status = 'skipped', error_message = 'Welcome reminder already delivered for this step.', updated_at = NOW()
            WHERE id = ${jobId}
          `;
          return { processed: false, error: 'Welcome reminder already delivered for this step.' };
        }
      }

      const tokenDeliveryRows = await sql`
        SELECT d.automation_job_id
        FROM automation_deliveries d
        JOIN automation_jobs j ON j.id = d.automation_job_id
        WHERE d.shop_domain = ${claim.shop_domain}
          AND d.rule_key = 'welcome_subscriber'
          AND d.token_id = ${deliveryTokenId ?? 0}
          AND j.payload -> 'metadata' ->> 'stepKey' = ${payloadStepKey}
        ORDER BY d.delivered_at DESC
        LIMIT 1
      `;

      if (tokenDeliveryRows[0]?.automation_job_id) {
        await sql`
          UPDATE automation_jobs
          SET status = 'skipped', error_message = 'Welcome reminder already delivered to token for this step.', updated_at = NOW()
          WHERE id = ${jobId}
        `;
        return { processed: false, error: 'Welcome reminder already delivered to token for this step.' };
      }

      if (claim.subscriber_id) {
        const subscriberDeliveryRows = await sql`
          SELECT d.automation_job_id
          FROM automation_deliveries d
          JOIN automation_jobs j ON j.id = d.automation_job_id
          WHERE d.shop_domain = ${claim.shop_domain}
            AND d.rule_key = 'welcome_subscriber'
            AND d.subscriber_id = ${claim.subscriber_id}
            AND j.payload -> 'metadata' ->> 'stepKey' = ${payloadStepKey}
          ORDER BY d.delivered_at DESC
          LIMIT 1
        `;

        if (subscriberDeliveryRows[0]?.automation_job_id) {
          await sql`
            UPDATE automation_jobs
            SET status = 'skipped', error_message = 'Welcome reminder already delivered to subscriber for this step.', updated_at = NOW()
            WHERE id = ${jobId}
          `;
          return { processed: false, error: 'Welcome reminder already delivered to subscriber for this step.' };
        }
      }
    }

    if (claim.rule_key === 'cart_abandonment_30m' && payloadStepKey) {
      const cartConfig = parseCartRuleConfig(ruleRows[0]?.config ?? null);
      const step = cartConfig.steps[payloadStepKey as CartStepKey];

      if (!step?.enabled) {
        await sql`
          UPDATE automation_jobs
          SET status = 'skipped', error_message = 'Cart reminder step is disabled.', updated_at = NOW()
          WHERE id = ${jobId}
        `;
        return { processed: false, error: 'Cart reminder step is disabled.' };
      }

      payload = {
        ...payload,
        title: step.title,
        body: step.body,
        targetUrl: step.targetUrl ?? payload.targetUrl ?? null,
        iconUrl: step.iconUrl ?? payload.iconUrl ?? null,
        imageUrl: step.imageUrl ?? payload.imageUrl ?? null,
        windowsImageUrl: step.windowsImageUrl ?? payload.windowsImageUrl ?? null,
        macosImageUrl: step.macosImageUrl ?? payload.macosImageUrl ?? null,
        androidImageUrl: step.androidImageUrl ?? payload.androidImageUrl ?? null,
        metadata: {
          ...(payload.metadata ?? {}),
          stepKey: payloadStepKey,
          actionButtons: step.actionButtons ?? [],
        },
      };
    }

    if (claim.rule_key === 'browse_abandonment_15m' && payloadStepKey) {
      const browseConfig = parseBrowseRuleConfig(ruleRows[0]?.config ?? null);
      const step = browseConfig.steps[payloadStepKey as BrowseStepKey];

      if (!step?.enabled) {
        await sql`
          UPDATE automation_jobs
          SET status = 'skipped', error_message = 'Browse reminder step is disabled.', updated_at = NOW()
          WHERE id = ${jobId}
        `;
        return { processed: false, error: 'Browse reminder step is disabled.' };
      }

      payload = {
        ...payload,
        title: step.title,
        body: step.body,
        targetUrl: step.targetUrl ?? payload.targetUrl ?? null,
        iconUrl: step.iconUrl ?? payload.iconUrl ?? null,
        imageUrl: step.imageUrl ?? payload.imageUrl ?? null,
        windowsImageUrl: step.windowsImageUrl ?? payload.windowsImageUrl ?? null,
        macosImageUrl: step.macosImageUrl ?? payload.macosImageUrl ?? null,
        androidImageUrl: step.androidImageUrl ?? payload.androidImageUrl ?? null,
        metadata: {
          ...(payload.metadata ?? {}),
          stepKey: payloadStepKey,
          actionButtons: step.actionButtons ?? [],
        },
      };
    }

    if (claim.rule_key === 'shipping_notifications') {
      const shippingConfig = parseShippingRuleConfig(ruleRows[0]?.config ?? null);
      const stepKey = (payloadStepKey || 'shipping-1') as ShippingStepKey;
      const step = shippingConfig.steps[stepKey];

      if (!step?.enabled) {
        await sql`
          UPDATE automation_jobs
          SET status = 'skipped', error_message = 'Shipping notification step is disabled.', updated_at = NOW()
          WHERE id = ${jobId}
        `;
        return { processed: false, error: 'Shipping notification step is disabled.' };
      }

      payload = {
        ...payload,
        title: step.title || payload.title,
        body: step.body || payload.body,
        targetUrl: step.targetUrl ?? payload.targetUrl ?? null,
        iconUrl: step.iconUrl ?? payload.iconUrl ?? null,
        imageUrl: step.imageUrl ?? payload.imageUrl ?? null,
        windowsImageUrl: step.windowsImageUrl ?? payload.windowsImageUrl ?? null,
        macosImageUrl: step.macosImageUrl ?? payload.macosImageUrl ?? null,
        androidImageUrl: step.androidImageUrl ?? payload.androidImageUrl ?? null,
        metadata: {
          ...(payload.metadata ?? {}),
          stepKey,
          actionButtons: step.actionButtons ?? [],
        },
      };
    }

    if (claim.rule_key === 'back_in_stock') {
      const backInStockConfig = parseBackInStockRuleConfig(ruleRows[0]?.config ?? null);
      const stepKey = (payloadStepKey || 'stock-1') as BackInStockStepKey;
      const step = backInStockConfig.steps[stepKey];

      if (!step?.enabled) {
        await sql`
          UPDATE automation_jobs
          SET status = 'skipped', error_message = 'Back-in-stock notification step is disabled.', updated_at = NOW()
          WHERE id = ${jobId}
        `;
        return { processed: false, error: 'Back-in-stock notification step is disabled.' };
      }

      payload = {
        ...payload,
        title: step.title || payload.title,
        body: step.body || payload.body,
        targetUrl: step.targetUrl ?? payload.targetUrl ?? null,
        iconUrl: step.iconUrl ?? payload.iconUrl ?? null,
        imageUrl: step.imageUrl ?? payload.imageUrl ?? null,
        windowsImageUrl: step.windowsImageUrl ?? payload.windowsImageUrl ?? null,
        macosImageUrl: step.macosImageUrl ?? payload.macosImageUrl ?? null,
        androidImageUrl: step.androidImageUrl ?? payload.androidImageUrl ?? null,
        metadata: {
          ...(payload.metadata ?? {}),
          stepKey,
          actionButtons: step.actionButtons ?? [],
        },
      };
    }

    if (claim.rule_key === 'price_drop') {
      const priceDropConfig = parsePriceDropRuleConfig(ruleRows[0]?.config ?? null);
      const stepKey = (payloadStepKey || 'price-1') as PriceDropStepKey;
      const step = priceDropConfig.steps[stepKey];

      if (!step?.enabled) {
        await sql`
          UPDATE automation_jobs
          SET status = 'skipped', error_message = 'Price-drop notification step is disabled.', updated_at = NOW()
          WHERE id = ${jobId}
        `;
        return { processed: false, error: 'Price-drop notification step is disabled.' };
      }

      payload = {
        ...payload,
        title: step.title || payload.title,
        body: step.body || payload.body,
        targetUrl: step.targetUrl ?? payload.targetUrl ?? null,
        iconUrl: step.iconUrl ?? payload.iconUrl ?? null,
        imageUrl: step.imageUrl ?? payload.imageUrl ?? null,
        windowsImageUrl: step.windowsImageUrl ?? payload.windowsImageUrl ?? null,
        macosImageUrl: step.macosImageUrl ?? payload.macosImageUrl ?? null,
        androidImageUrl: step.androidImageUrl ?? payload.androidImageUrl ?? null,
        metadata: {
          ...(payload.metadata ?? {}),
          stepKey,
          actionButtons: step.actionButtons ?? [],
        },
      };
    }

    const skipReason = await getAutomationSkipReason(claim.shop_domain, payload);
    if (skipReason) {
      await sql`
        UPDATE automation_jobs
        SET status = 'skipped', error_message = ${skipReason}, updated_at = NOW()
        WHERE id = ${jobId}
      `;
      return { processed: false, error: skipReason };
    }

    const destination = await resolveAutomationDestination(claim.shop_domain, payload);
    payload = {
      ...payload,
      targetUrl: destination.targetUrl,
      iconUrl: destination.iconUrl,
      imageUrl: selectAutomationImageForDevice({
        ...payload,
        imageUrl: destination.imageUrl,
        windowsImageUrl: destination.windowsImageUrl,
        macosImageUrl: destination.macosImageUrl,
        androidImageUrl: destination.androidImageUrl,
      }, subscriberPlatform, subscriberBrowser),
      windowsImageUrl: destination.windowsImageUrl,
      macosImageUrl: destination.macosImageUrl,
      androidImageUrl: destination.androidImageUrl,
      metadata: {
        ...(payload.metadata ?? {}),
        actionButtons: destination.actionButtons,
      },
    };

    const trackedTargetUrl = payload.ruleKey
      ? buildAutomationTrackedUrl(payload.targetUrl ?? null, payload.ruleKey, claim.shop_domain, payload.externalId ?? null)
      : payload.targetUrl ?? null;

    let fcmMessageId: string;

    const rawActionButtons = Array.isArray((payload.metadata ?? {}).actionButtons)
      ? ((payload.metadata ?? {}).actionButtons as Array<Record<string, unknown>>)
      : [];
    const automationActions = rawActionButtons
      .slice(0, 2)
      .filter((btn) => btn?.title && btn?.link)
      .map((btn, i) => ({ action: `btn_${i + 1}`, title: String(btn.title) }));
    const automationButton1Url = rawActionButtons[0]?.link ? String(rawActionButtons[0].link) : '';
    const automationButton2Url = rawActionButtons[1]?.link ? String(rawActionButtons[1].link) : '';
    const automationAction1Title = automationActions[0]?.title ?? '';
    const automationAction2Title = automationActions[1]?.title ?? '';

    if (tokenType === 'vapid') {
      // VAPID send for Firefox / Safari
      const vapidEndpoint = String(activeTokenRow?.vapid_endpoint ?? '');
      const vapidP256dh = String(activeTokenRow?.vapid_p256dh ?? '');
      const vapidAuth = String(activeTokenRow?.vapid_auth ?? '');
      if (!vapidEndpoint || !vapidP256dh || !vapidAuth) {
        throw new Error('Incomplete VAPID subscription data.');
      }
      fcmMessageId = await sendVapidPushNotification(
        { endpoint: vapidEndpoint, keys: { p256dh: vapidP256dh, auth: vapidAuth } },
        {
          title: payload.title,
          body: payload.body,
          icon: payload.iconUrl ?? null,
          image: payload.imageUrl ?? null,
          url: trackedTargetUrl ?? payload.targetUrl ?? null,
          actions: automationActions,
          button1Url: automationButton1Url || null,
          button2Url: automationButton2Url || null,
        },
      );
    } else {
      // FCM send for Chrome / Edge / Opera / Samsung
      const messaging = getFirebaseAdminMessaging();
      const message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl ?? undefined,
        },
        webpush: {
          fcmOptions: { link: trackedTargetUrl ?? undefined },
          notification: {
            icon: payload.iconUrl ?? undefined,
            image: payload.imageUrl ?? undefined,
            actions: automationActions.length > 0 ? automationActions : undefined,
          },
        },
        data: {
          source: 'automation',
          ruleKey: String(payload.ruleKey ?? ''),
          url: trackedTargetUrl ?? payload.targetUrl ?? '',
          button1Url: automationButton1Url,
          button2Url: automationButton2Url,
          action1Title: automationAction1Title,
          action2Title: automationAction2Title,
        },
      };

      fcmMessageId = await messaging.send(message);
    }

    await sql`
      UPDATE automation_jobs
      SET status = 'sent', sent_at = NOW(), updated_at = NOW(), error_message = NULL
      WHERE id = ${jobId}
    `;

    await sql`
      INSERT INTO automation_deliveries (
        automation_job_id,
        rule_key,
        shop_domain,
        subscriber_id,
        token_id,
        external_id,
        target_url,
        fcm_message_id
      )
      VALUES (
        ${claim.id},
        ${payload.ruleKey ?? claim.rule_key},
        ${claim.shop_domain},
        ${claim.subscriber_id ?? null},
        ${deliveryTokenId},
        ${payload.externalId ?? null},
        ${payload.targetUrl ?? null},
        ${fcmMessageId}
      )
    `;

    return { processed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send automation message.';
    await sql`
      UPDATE automation_jobs
      SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
          error_message = ${message},
          due_at = CASE WHEN attempts >= 5 THEN due_at ELSE NOW() + INTERVAL '5 minutes' END,
          updated_at = NOW()
      WHERE id = ${jobId}
    `;

    return { processed: false, error: message };
  }
};

export const recordSubscriberActivity = async (input: {
  shopDomain: string;
  externalId: string;
  eventType: 'page_view' | 'product_view' | 'add_to_cart' | 'checkout_start';
  pageUrl?: string | null;
  productId?: string | null;
  cartToken?: string | null;
  metadata?: Record<string, unknown> | null;
}) => {
  await ensureSchema();
  const sql = getNeonSql();
  const triggeredAt = new Date().toISOString();

  await ensureAutomationRules(input.shopDomain);

  const eventId = randomUUID();
  await sql`
    INSERT INTO subscriber_activity_events (id, shop_domain, external_id, event_type, page_url, product_id, cart_token, metadata)
    VALUES (
      ${eventId},
      ${input.shopDomain},
      ${input.externalId},
      ${input.eventType},
      ${input.pageUrl ?? null},
      ${input.productId ?? null},
      ${input.cartToken ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
  `;

  const queueRule = async (ruleKey: AutomationRuleKey, fallbackDelayMinutes: number, dedupeKeyBase: string, payload: AutomationJobPayload) => {
    const rule = await getRuleConfig(input.shopDomain, ruleKey);
    if (!rule.enabled) {
      return;
    }

    const delayMinutes = Math.max(0, Number(rule.config.delayMinutes ?? fallbackDelayMinutes));
    const dueAt = new Date(Date.now() + delayMinutes * 60 * 1000);
    const targets = await listAutomationTargets({ shopDomain: input.shopDomain, externalId: input.externalId });

    if (targets.length === 0) {
      return;
    }

    await enqueueAutomationForTargets({
      shopDomain: input.shopDomain,
      ruleKey,
      targets,
      dedupeKeyBase,
      dueAt,
      payload: {
        ...payload,
        externalId: input.externalId,
        productId: input.productId ?? null,
        cartToken: input.cartToken ?? null,
        triggeredAt,
      },
    });
  };

  if (input.eventType === 'product_view') {
    const rule = await getRuleConfig(input.shopDomain, 'browse_abandonment_15m');
    if (rule.enabled) {
      const browseConfig = parseBrowseRuleConfig(rule.config);
      const targets = await listAutomationTargets({ shopDomain: input.shopDomain, externalId: input.externalId });

      for (const stepKey of Object.keys(browseConfig.steps) as BrowseStepKey[]) {
        const step = browseConfig.steps[stepKey];
        if (!step.enabled || targets.length === 0) {
          continue;
        }

        const dueAt = new Date(Date.now() + step.delayMinutes * 60 * 1000);
        await enqueueAutomationForTargets({
          shopDomain: input.shopDomain,
          ruleKey: 'browse_abandonment_15m',
          targets,
          dedupeKeyBase: `browse15:${input.shopDomain}:${input.externalId}:${input.productId ?? input.pageUrl ?? 'unknown'}:${stepKey}`,
          dueAt,
          payload: {
            title: step.title,
            body: step.body,
            targetUrl: step.targetUrl ?? input.pageUrl ?? null,
            iconUrl: step.iconUrl ?? null,
            imageUrl: step.imageUrl ?? null,
            windowsImageUrl: step.windowsImageUrl ?? null,
            macosImageUrl: step.macosImageUrl ?? null,
            androidImageUrl: step.androidImageUrl ?? null,
            campaignLabel: `browse_abandonment_15m:${stepKey}`,
            metadata: {
              stepKey,
              actionButtons: step.actionButtons ?? [],
            },
            externalId: input.externalId,
            productId: input.productId ?? null,
            cartToken: input.cartToken ?? null,
            triggeredAt,
          },
        });
      }
    }
  }

  if (input.eventType === 'add_to_cart') {
    const rule = await getRuleConfig(input.shopDomain, 'cart_abandonment_30m');
    if (rule.enabled) {
      const cartConfig = parseCartRuleConfig(rule.config);
      const targets = await listAutomationTargets({ shopDomain: input.shopDomain, externalId: input.externalId });

      for (const stepKey of Object.keys(cartConfig.steps) as CartStepKey[]) {
        const step = cartConfig.steps[stepKey];
        if (!step.enabled || targets.length === 0) {
          continue;
        }

        const dueAt = new Date(Date.now() + step.delayMinutes * 60 * 1000);
        await enqueueAutomationForTargets({
          shopDomain: input.shopDomain,
          ruleKey: 'cart_abandonment_30m',
          targets,
          dedupeKeyBase: `cart30:${input.shopDomain}:${input.externalId}:${input.cartToken ?? input.productId ?? input.pageUrl ?? 'unknown'}:${stepKey}`,
          dueAt,
          payload: {
            title: step.title,
            body: step.body,
            targetUrl: step.targetUrl ?? input.pageUrl ?? '/cart',
            iconUrl: step.iconUrl ?? null,
            imageUrl: step.imageUrl ?? null,
            windowsImageUrl: step.windowsImageUrl ?? null,
            macosImageUrl: step.macosImageUrl ?? null,
            androidImageUrl: step.androidImageUrl ?? null,
            campaignLabel: `cart_abandonment_30m:${stepKey}`,
            metadata: {
              stepKey,
              actionButtons: step.actionButtons ?? [],
            },
            externalId: input.externalId,
            productId: input.productId ?? null,
            cartToken: input.cartToken ?? null,
            triggeredAt,
          },
        });
      }
    }
  }

  if (input.eventType === 'checkout_start') {
    await queueRule(
      'checkout_abandonment_30m',
      30,
      `checkout30:${input.shopDomain}:${input.externalId}:${input.cartToken ?? input.pageUrl ?? 'unknown'}`,
      {
        title: 'Complete your checkout',
        body: 'Your order is almost complete. Finish checking out while your cart is still fresh.',
        targetUrl: input.pageUrl ?? '/checkout',
        campaignLabel: 'checkout_abandonment_30m',
      },
    );
  }

  return { eventId };
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

  const targets = await listAutomationTargets({
    shopDomain: input.shopDomain,
    externalId: input.externalId ?? null,
    subscriberId,
  });

  if (targets.length === 0) {
    return;
  }

  const postPurchaseRule = await getRuleConfig(input.shopDomain, 'post_purchase_followup');
  if (postPurchaseRule.enabled) {
    const delayDays = Math.max(0, Number(postPurchaseRule.config.delayDays ?? 2));
    const dueAt = new Date(createdAt.getTime() + delayDays * 24 * 60 * 60 * 1000);

    await enqueueAutomationForTargets({
      shopDomain: input.shopDomain,
      ruleKey: 'post_purchase_followup',
      targets,
      dedupeKeyBase: `postpurchase:${input.shopDomain}:${input.orderId}`,
      dueAt,
      payload: {
        title: 'How is your order going?',
        body: 'Thanks for your purchase. Come back for more products you might love.',
        targetUrl: '/',
        campaignLabel: 'post_purchase_followup',
        externalId: input.externalId ?? null,
        customerId: input.customerId ?? null,
        orderId: input.orderId,
        triggeredAt: createdAt.toISOString(),
      },
    });
  }

  const winBackRule = await getRuleConfig(input.shopDomain, 'win_back_7d');
  if (winBackRule.enabled) {
    const delayDays = Math.max(1, Number(winBackRule.config.delayDays ?? 7));
    const dueAt = new Date(createdAt.getTime() + delayDays * 24 * 60 * 60 * 1000);

    await enqueueAutomationForTargets({
      shopDomain: input.shopDomain,
      ruleKey: 'win_back_7d',
      targets,
      dedupeKeyBase: `winback:${input.shopDomain}:${input.orderId}`,
      dueAt,
      payload: {
        title: 'We saved something for you',
        body: 'It has been a while since your last order. Come back and see what is new.',
        targetUrl: '/',
        campaignLabel: 'win_back_7d',
        externalId: input.externalId ?? null,
        customerId: input.customerId ?? null,
        orderId: input.orderId,
        triggeredAt: createdAt.toISOString(),
      },
    });
  }
};

export const upsertShopifyProductVariants = async (input: UpsertShopifyProductVariantsInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  const variantIds = input.variants.map((variant) => variant.variantId);
  const existingRows = variantIds.length
    ? await sql`
      SELECT variant_id, price_cents, compare_at_price_cents, available
      FROM shopify_product_variants
      WHERE shop_domain = ${input.shopDomain}
        AND variant_id = ANY(${variantIds})
    `
    : [];

  const existingByVariantId = new Map(
    existingRows.map((row) => [String(row.variant_id), {
      priceCents: row.price_cents == null ? null : Number(row.price_cents),
      compareAtPriceCents: row.compare_at_price_cents == null ? null : Number(row.compare_at_price_cents),
      available: row.available == null ? null : Number(row.available),
    }]),
  );

  const updatedAt = input.updatedAt ? new Date(input.updatedAt) : new Date();
  const priceDropCandidates = [] as string[];

  for (const variant of input.variants) {
    const existing = existingByVariantId.get(variant.variantId);

    if (
      existing?.priceCents != null
      && variant.priceCents != null
      && variant.priceCents < existing.priceCents
    ) {
      priceDropCandidates.push(variant.variantId);
    }

    await sql`
      INSERT INTO shopify_product_variants (
        shop_domain,
        product_id,
        variant_id,
        inventory_item_id,
        product_title,
        variant_title,
        handle,
        image_url,
        price_cents,
        compare_at_price_cents,
        available,
        updated_at,
        last_seen_at
      )
      VALUES (
        ${input.shopDomain},
        ${input.productId},
        ${variant.variantId},
        ${variant.inventoryItemId ?? null},
        ${input.productTitle ?? null},
        ${variant.variantTitle ?? null},
        ${input.handle ?? null},
        ${input.imageUrl ?? null},
        ${variant.priceCents ?? null},
        ${variant.compareAtPriceCents ?? null},
        ${existing?.available ?? null},
        ${updatedAt},
        NOW()
      )
      ON CONFLICT (shop_domain, variant_id)
      DO UPDATE SET
        product_id = EXCLUDED.product_id,
        inventory_item_id = COALESCE(EXCLUDED.inventory_item_id, shopify_product_variants.inventory_item_id),
        product_title = COALESCE(EXCLUDED.product_title, shopify_product_variants.product_title),
        variant_title = COALESCE(EXCLUDED.variant_title, shopify_product_variants.variant_title),
        handle = COALESCE(EXCLUDED.handle, shopify_product_variants.handle),
        image_url = COALESCE(EXCLUDED.image_url, shopify_product_variants.image_url),
        price_cents = COALESCE(EXCLUDED.price_cents, shopify_product_variants.price_cents),
        compare_at_price_cents = COALESCE(EXCLUDED.compare_at_price_cents, shopify_product_variants.compare_at_price_cents),
        updated_at = COALESCE(EXCLUDED.updated_at, shopify_product_variants.updated_at),
        last_seen_at = NOW()
    `;
  }

  const priceDropRule = await getRuleConfig(input.shopDomain, 'price_drop');
  if (!priceDropRule.enabled || priceDropCandidates.length === 0) {
    return;
  }

  await enqueueProductInterestAutomation({
    shopDomain: input.shopDomain,
    ruleKey: 'price_drop',
    productIdentifiers: [input.productId, ...priceDropCandidates],
    dedupeKeySeed: `pricedrop:${input.shopDomain}:${input.productId}:${updatedAt.toISOString()}`,
    payload: {
      title: `${input.productTitle ?? 'An item you viewed'} is now cheaper`,
      body: 'The price dropped since the last time this shopper viewed it.',
      targetUrl: buildProductUrl(input.handle) ?? '/',
      campaignLabel: 'price_drop',
      productId: input.productId,
      triggeredAt: updatedAt.toISOString(),
      metadata: {
        stepKey: 'price-1',
        variantIds: priceDropCandidates,
      },
    },
  });
};

export const processInventoryLevelUpdate = async (input: ProcessInventoryLevelUpdateInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  const rows = await sql`
    SELECT variant_id, product_id, product_title, handle, available
    FROM shopify_product_variants
    WHERE shop_domain = ${input.shopDomain}
      AND inventory_item_id = ${input.inventoryItemId}
  `;

  if (rows.length === 0) {
    return;
  }

  const updatedAt = input.updatedAt ? new Date(input.updatedAt) : new Date();
  const backInStockCandidates = [] as Array<{ productId: string; variantId: string; productTitle: string | null; handle: string | null }>;

  for (const row of rows) {
    const previousAvailable = row.available == null ? null : Number(row.available);
    if ((previousAvailable == null || previousAvailable <= 0) && (input.available ?? 0) > 0) {
      backInStockCandidates.push({
        productId: String(row.product_id),
        variantId: String(row.variant_id),
        productTitle: row.product_title ? String(row.product_title) : null,
        handle: row.handle ? String(row.handle) : null,
      });
    }
  }

  await sql`
    UPDATE shopify_product_variants
    SET available = ${input.available}, updated_at = ${updatedAt}, last_seen_at = NOW()
    WHERE shop_domain = ${input.shopDomain}
      AND inventory_item_id = ${input.inventoryItemId}
  `;

  const backInStockRule = await getRuleConfig(input.shopDomain, 'back_in_stock');
  if (!backInStockRule.enabled || backInStockCandidates.length === 0) {
    return;
  }

  for (const candidate of backInStockCandidates) {
    await enqueueProductInterestAutomation({
      shopDomain: input.shopDomain,
      ruleKey: 'back_in_stock',
      productIdentifiers: [candidate.productId, candidate.variantId],
      dedupeKeySeed: `backinstock:${input.shopDomain}:${candidate.variantId}:${updatedAt.toISOString()}`,
      payload: {
        title: `${candidate.productTitle ?? 'An item you viewed'} is back in stock`,
        body: 'Inventory is available again. Shoppers can come back before it sells out.',
        targetUrl: buildProductUrl(candidate.handle) ?? '/',
        campaignLabel: 'back_in_stock',
        productId: candidate.productId,
        triggeredAt: updatedAt.toISOString(),
        metadata: {
          stepKey: 'stock-1',
          variantId: candidate.variantId,
          inventoryItemId: input.inventoryItemId,
          available: input.available,
        },
      },
    });
  }
};

export const processFulfillmentUpdate = async (input: ProcessFulfillmentUpdateInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  const updatedAt = input.updatedAt ? new Date(input.updatedAt) : new Date();
  await sql`
    INSERT INTO shopify_fulfillments (
      shop_domain,
      fulfillment_id,
      order_id,
      status,
      shipment_status,
      tracking_company,
      tracking_numbers,
      tracking_urls,
      updated_at,
      last_seen_at
    )
    VALUES (
      ${input.shopDomain},
      ${input.fulfillmentId},
      ${input.orderId},
      ${input.status ?? null},
      ${input.shipmentStatus ?? null},
      ${input.trackingCompany ?? null},
      ${JSON.stringify(input.trackingNumbers ?? [])}::jsonb,
      ${JSON.stringify(input.trackingUrls ?? [])}::jsonb,
      ${updatedAt},
      NOW()
    )
    ON CONFLICT (shop_domain, fulfillment_id)
    DO UPDATE SET
      order_id = EXCLUDED.order_id,
      status = COALESCE(EXCLUDED.status, shopify_fulfillments.status),
      shipment_status = COALESCE(EXCLUDED.shipment_status, shopify_fulfillments.shipment_status),
      tracking_company = COALESCE(EXCLUDED.tracking_company, shopify_fulfillments.tracking_company),
      tracking_numbers = EXCLUDED.tracking_numbers,
      tracking_urls = EXCLUDED.tracking_urls,
      updated_at = COALESCE(EXCLUDED.updated_at, shopify_fulfillments.updated_at),
      last_seen_at = NOW()
  `;

  const shippingRule = await getRuleConfig(input.shopDomain, 'shipping_notifications');
  if (!shippingRule.enabled) {
    return;
  }

  const allowedStatuses = Array.isArray(shippingRule.config.sendWhen)
    ? shippingRule.config.sendWhen.map((value) => String(value).toLowerCase())
    : ['in_transit', 'out_for_delivery', 'delivered'];
  const effectiveStatus = String(input.shipmentStatus ?? input.status ?? '').toLowerCase();

  if (!effectiveStatus || !allowedStatuses.includes(effectiveStatus)) {
    return;
  }

  const orderRows = await sql`
    SELECT subscriber_id, external_id, customer_id
    FROM shopify_orders
    WHERE shop_domain = ${input.shopDomain}
      AND order_id = ${input.orderId}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const orderRow = orderRows[0];
  const targets = await listAutomationTargets({
    shopDomain: input.shopDomain,
    externalId: orderRow?.external_id ? String(orderRow.external_id) : null,
    subscriberId: orderRow?.subscriber_id ? Number(orderRow.subscriber_id) : null,
  });

  if (targets.length === 0) {
    return;
  }

  const titleByStatus: Record<string, string> = {
    in_transit: 'Your order is on the way',
    out_for_delivery: 'Your order is out for delivery',
    delivered: 'Your order was delivered',
  };

  await enqueueAutomationForTargets({
    shopDomain: input.shopDomain,
    ruleKey: 'shipping_notifications',
    targets,
    dedupeKeyBase: `shipping:${input.shopDomain}:${input.fulfillmentId}:${effectiveStatus}`,
    payload: {
      title: titleByStatus[effectiveStatus] ?? 'Your order status changed',
      body: input.trackingCompany
        ? `Carrier update from ${input.trackingCompany}.`
        : 'There is a new fulfillment update for your order.',
      targetUrl: '/',
      campaignLabel: 'shipping_notifications',
      externalId: orderRow?.external_id ? String(orderRow.external_id) : null,
      customerId: orderRow?.customer_id ? String(orderRow.customer_id) : null,
      orderId: input.orderId,
      triggeredAt: updatedAt.toISOString(),
      metadata: {
        stepKey: 'shipping-1',
        fulfillmentId: input.fulfillmentId,
        shipmentStatus: input.shipmentStatus ?? null,
        status: input.status ?? null,
        trackingCompany: input.trackingCompany ?? null,
        trackingNumbers: input.trackingNumbers ?? [],
        trackingUrls: input.trackingUrls ?? [],
      },
    },
  });
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

export const resolveCampaignAudience = async (
  shopDomain: string,
  segmentId?: string | null,
  excludeDeliveredCampaignId?: string | null,
) => {
  await ensureSchema();
  const sql = getNeonSql();

  if (!segmentId || segmentId === 'all') {
    const rows = excludeDeliveredCampaignId
      ? await sql`
        SELECT
          t.id AS token_id,
          t.fcm_token,
          t.token_type,
          t.vapid_endpoint,
          t.vapid_p256dh,
          t.vapid_auth,
          s.id AS subscriber_id,
          s.external_id,
          s.platform
        FROM subscribers s
        JOIN subscriber_tokens t ON t.subscriber_id = s.id
        WHERE s.shop_domain = ${shopDomain}
          AND t.shop_domain = ${shopDomain}
          AND t.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM campaign_deliveries cd
            WHERE cd.campaign_id = ${excludeDeliveredCampaignId}
              AND cd.token_id = t.id
          )
        ORDER BY t.last_seen_at DESC, t.updated_at DESC, t.id DESC
      `
      : await sql`
        SELECT
          t.id AS token_id,
          t.fcm_token,
          t.token_type,
          t.vapid_endpoint,
          t.vapid_p256dh,
          t.vapid_auth,
          s.id AS subscriber_id,
          s.external_id,
          s.platform
        FROM subscribers s
        JOIN subscriber_tokens t ON t.subscriber_id = s.id
        WHERE s.shop_domain = ${shopDomain}
          AND t.shop_domain = ${shopDomain}
          AND t.status = 'active'
        ORDER BY t.last_seen_at DESC, t.updated_at DESC, t.id DESC
      `;
    return rows as Array<{
      token_id: string | number;
      fcm_token: string;
      token_type: string | null;
      vapid_endpoint: string | null;
      vapid_p256dh: string | null;
      vapid_auth: string | null;
      subscriber_id: string | number;
      external_id: string | null;
      platform: string | null;
    }>;
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

  const rows = excludeDeliveredCampaignId
    ? await sql`
      SELECT
        t.id AS token_id,
        t.fcm_token,
        t.token_type,
        t.vapid_endpoint,
        t.vapid_p256dh,
        t.vapid_auth,
        s.id AS subscriber_id,
        s.external_id,
        s.platform
      FROM subscribers s
      JOIN subscriber_tokens t ON t.subscriber_id = s.id
      WHERE s.shop_domain = ${shopDomain}
        AND t.shop_domain = ${shopDomain}
        AND t.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM campaign_deliveries cd
          WHERE cd.campaign_id = ${excludeDeliveredCampaignId}
            AND cd.token_id = t.id
        )
      ORDER BY t.last_seen_at DESC, t.updated_at DESC, t.id DESC
    `
    : await sql`
      SELECT
        t.id AS token_id,
        t.fcm_token,
        t.token_type,
        t.vapid_endpoint,
        t.vapid_p256dh,
        t.vapid_auth,
        s.id AS subscriber_id,
        s.external_id,
        s.platform
      FROM subscribers s
      JOIN subscriber_tokens t ON t.subscriber_id = s.id
      WHERE s.shop_domain = ${shopDomain}
        AND t.shop_domain = ${shopDomain}
        AND t.status = 'active'
      ORDER BY t.last_seen_at DESC, t.updated_at DESC, t.id DESC
    `;

  return (rows as Array<{
    token_id: string | number;
    fcm_token: string;
    token_type: string | null;
    vapid_endpoint: string | null;
    vapid_p256dh: string | null;
    vapid_auth: string | null;
    subscriber_id: string | number;
    external_id: string | null;
    platform: string | null;
  }>).filter((row) =>
    allowedIds.has(Number(row.subscriber_id)),
  );
};

export const countCampaignAudienceTokens = async (shopDomain: string, segmentId?: string | null) => {
  const rows = await resolveCampaignAudience(shopDomain, segmentId);
  return rows.length;
};

export const listQueuedCampaigns = async (limit = 25, shardCount = 1, shardIndex = 0) => {
  await ensureSchema();
  const sql = getNeonSql();

  const safeShardCount = Math.max(1, Math.min(Number(shardCount) || 1, 128));
  const safeShardIndex = Math.max(0, Math.min(Number(shardIndex) || 0, safeShardCount - 1));

  const rows = await sql`
    SELECT id, shop_domain
    FROM campaigns
    WHERE status = 'queued'
      AND (
        ${safeShardCount} = 1
        OR MOD(ABS(hashtext(id)), ${safeShardCount}) = ${safeShardIndex}
      )
    ORDER BY scheduled_at ASC NULLS LAST, created_at ASC
    LIMIT ${limit}
  `;

  return rows as Array<{ id: string; shop_domain: string }>;
};

export const getCampaignProgress = async (shopDomain: string, campaignId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const campaign = await getCampaignById(shopDomain, campaignId);
  if (!campaign) {
    return null;
  }

  const deliveredRows = await sql`
    SELECT COUNT(*)::INT AS count
    FROM campaign_deliveries
    WHERE campaign_id = ${campaignId}
      AND shop_domain = ${shopDomain}
  `;

  const totalAudience = await countCampaignAudienceTokens(shopDomain, (campaign as { segment_id?: string | null }).segment_id ?? null);
  const delivered = Number(deliveredRows[0]?.count ?? 0);
  const total = Math.max(totalAudience, delivered);
  const remaining = Math.max(total - delivered, 0);
  const percentComplete = total > 0 ? Math.min(100, (delivered / total) * 100) : 0;

  return {
    campaignId,
    status: String((campaign as { status?: string }).status ?? 'draft'),
    delivered,
    totalAudience: total,
    remaining,
    percentComplete,
  };
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
  await ensureAutomationRules(input.shopDomain);

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

  const existingActiveTokenRows = await sql`
    SELECT id
    FROM subscriber_tokens
    WHERE shop_domain = ${input.shopDomain}
      AND subscriber_id = ${subscriberId}
      AND status = 'active'
      AND fcm_token <> ${input.token}
    LIMIT 1
  `;

  const tokenRows = await sql`
    INSERT INTO subscriber_tokens (shop_domain, subscriber_id, fcm_token, user_agent, status, token_type, vapid_endpoint, vapid_p256dh, vapid_auth, updated_at, last_seen_at)
    VALUES (
      ${input.shopDomain},
      ${subscriberId},
      ${input.token},
      ${input.userAgent ?? null},
      'active',
      ${input.tokenType ?? 'fcm'},
      ${input.vapidEndpoint ?? null},
      ${input.vapidP256dh ?? null},
      ${input.vapidAuth ?? null},
      NOW(),
      NOW()
    )
    ON CONFLICT (shop_domain, fcm_token)
    DO UPDATE SET
      subscriber_id = EXCLUDED.subscriber_id,
      user_agent = EXCLUDED.user_agent,
      token_type = EXCLUDED.token_type,
      vapid_endpoint = COALESCE(EXCLUDED.vapid_endpoint, subscriber_tokens.vapid_endpoint),
      vapid_p256dh = COALESCE(EXCLUDED.vapid_p256dh, subscriber_tokens.vapid_p256dh),
      vapid_auth = COALESCE(EXCLUDED.vapid_auth, subscriber_tokens.vapid_auth),
      status = 'active',
      updated_at = NOW(),
      last_seen_at = NOW()
    RETURNING id, (xmax = 0) AS was_inserted
  `;

  const tokenId = Number(tokenRows[0]?.id);
  const tokenWasInserted = Boolean(tokenRows[0]?.was_inserted);
  const subscriberAlreadyHadActiveToken = existingActiveTokenRows.length > 0;

  const welcomeRuleRows = await sql`
    SELECT enabled, config
    FROM automation_rules
    WHERE shop_domain = ${input.shopDomain}
      AND rule_key = 'welcome_subscriber'
    LIMIT 1
  `;

  if (Boolean(welcomeRuleRows[0]?.enabled) && tokenWasInserted && !subscriberAlreadyHadActiveToken) {
    const existingWelcomeJobRows = await sql`
      SELECT id
      FROM automation_jobs
      WHERE shop_domain = ${input.shopDomain}
        AND rule_key = 'welcome_subscriber'
        AND payload ->> 'externalId' = ${input.externalId}
        AND status IN ('pending', 'processing', 'sent')
      LIMIT 1
    `;

    const existingWelcomeDeliveryRows = await sql`
      SELECT id
      FROM automation_deliveries
      WHERE shop_domain = ${input.shopDomain}
        AND rule_key = 'welcome_subscriber'
        AND external_id = ${input.externalId}
      LIMIT 1
    `;

    if (existingWelcomeJobRows.length > 0 || existingWelcomeDeliveryRows.length > 0) {
      return {
        subscriberId,
        tokenId,
      };
    }

    const welcomeConfig = parseWelcomeRuleConfig(welcomeRuleRows[0]?.config ?? null);
    const now = Date.now();
    const immediateWelcomeJobIds: string[] = [];

    for (const stepKey of Object.keys(welcomeConfig.steps) as WelcomeStepKey[]) {
      const step = welcomeConfig.steps[stepKey];
      if (!step.enabled) {
        continue;
      }

      const dueAt = new Date(now + step.delayMinutes * 60_000);

      const jobId = await enqueueAutomationJob({
        shopDomain: input.shopDomain,
        ruleKey: 'welcome_subscriber',
        tokenId,
        subscriberId,
        dedupeKey: `welcome:${input.shopDomain}:external:${input.externalId}:${stepKey}`,
        dueAt,
        payload: {
          title: step.title,
          body: step.body,
          targetUrl: step.targetUrl ?? null,
          iconUrl: step.iconUrl ?? null,
          imageUrl: step.imageUrl ?? null,
          windowsImageUrl: step.windowsImageUrl ?? null,
          macosImageUrl: step.macosImageUrl ?? null,
          androidImageUrl: step.androidImageUrl ?? null,
          metadata: {
            stepKey,
            actionButtons: step.actionButtons ?? [],
          },
          campaignLabel: `welcome_subscriber:${stepKey}`,
          ruleKey: 'welcome_subscriber',
          externalId: input.externalId,
          triggeredAt: new Date().toISOString(),
        },
      });

      if (step.delayMinutes <= 0 && jobId) {
        immediateWelcomeJobIds.push(jobId);
      }
    }

    if (immediateWelcomeJobIds.length > 0) {
      await Promise.all(immediateWelcomeJobIds.map((jobId) => processAutomationJob(jobId)));
    }
  }

  return {
    subscriberId,
    tokenId,
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
      windows_image_url,
      macos_image_url,
      android_image_url,
      action_buttons,
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
      ${input.windowsImageUrl ?? null},
      ${input.macosImageUrl ?? null},
      ${input.androidImageUrl ?? null},
      ${JSON.stringify(input.actionButtons ?? [])}::jsonb,
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

export const getCampaignById = async (shopDomain: string, campaignId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const rows = await sql`
    SELECT *
    FROM campaigns
    WHERE shop_domain = ${shopDomain}
      AND id = ${campaignId}
    LIMIT 1
  `;

  return rows[0] ?? null;
};

export const getCampaignStats = async (shopDomain: string, from?: Date | null, to?: Date | null) => {
  await ensureSchema();
  const sql = getNeonSql();

  const start = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = to ?? new Date();

  const rows = await sql`
    SELECT
      COALESCE(SUM(delivery_count), 0)::BIGINT AS impressions,
      COALESCE(SUM(click_count), 0)::BIGINT AS clicks,
      COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
    FROM campaigns
    WHERE shop_domain = ${shopDomain}
      AND created_at >= ${start}
      AND created_at <= ${end}
  `;

  const impressions = Number(rows[0]?.impressions ?? 0);
  const clicks = Number(rows[0]?.clicks ?? 0);
  const revenueCents = Number(rows[0]?.revenue_cents ?? 0);

  return {
    impressions,
    clicks,
    avgCtrPercent: impressions > 0 ? (clicks / impressions) * 100 : 0,
    revenueCents,
  };
};

export const getCampaignResults = async (shopDomain: string, campaignId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const campaign = await getCampaignById(shopDomain, campaignId);
  if (!campaign) {
    return null;
  }

  const clickRows = await sql`
    SELECT
      LPAD(EXTRACT(HOUR FROM clicked_at)::TEXT, 2, '0') || 'h' AS hour,
      COUNT(*)::BIGINT AS clicks
    FROM campaign_clicks
    WHERE shop_domain = ${shopDomain}
      AND campaign_id = ${campaignId}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  const platformRows = await sql`
    SELECT
      LOWER(COALESCE(NULLIF(s.platform, ''), NULLIF(s.device_context ->> 'osName', ''), 'unknown')) AS platform,
      COUNT(*)::BIGINT AS clicks
    FROM campaign_clicks c
    LEFT JOIN subscribers s ON s.id = c.subscriber_id
    WHERE c.shop_domain = ${shopDomain}
      AND c.campaign_id = ${campaignId}
    GROUP BY 1
    ORDER BY 2 DESC
    LIMIT 8
  `;

  return {
    campaign,
    performanceOverTime: clickRows.map((row) => ({ hour: String(row.hour), clicks: Number(row.clicks ?? 0) })),
    platformPerformance: platformRows.map((row) => ({ platform: String(row.platform), clicks: Number(row.clicks ?? 0) })),
  };
};

export const getAnalyticsStats = async (shopDomain: string, from?: Date | null, to?: Date | null) => {
  await ensureSchema();
  const sql = getNeonSql();

  const start = from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = to ?? new Date();

  const [
    campaignKpiRows,
    autoDeliveryRows,
    autoClickRows,
    subscriberRows,
    dailyRevenueRows,
    topCampaignRows,
    topAutoRows,
    topAutoClickRows,
  ] = await Promise.all([
    sql`
      SELECT
        COALESCE(SUM(delivery_count), 0)::BIGINT AS impressions,
        COALESCE(SUM(click_count), 0)::BIGINT AS clicks,
        COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
      FROM campaigns
      WHERE shop_domain = ${shopDomain}
        AND created_at >= ${start} AND created_at <= ${end}
    `,
    sql`
      SELECT
        COUNT(*)::BIGINT AS impressions,
        COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
      FROM automation_deliveries
      WHERE shop_domain = ${shopDomain}
        AND delivered_at >= ${start} AND delivered_at <= ${end}
    `,
    sql`
      SELECT
        COUNT(*)::BIGINT AS clicks,
        COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
      FROM automation_clicks
      WHERE shop_domain = ${shopDomain}
        AND clicked_at >= ${start} AND clicked_at <= ${end}
    `,
    sql`
      SELECT COUNT(*)::BIGINT AS count
      FROM subscribers
      WHERE shop_domain = ${shopDomain}
        AND created_at >= ${start} AND created_at <= ${end}
    `,
    sql`
      SELECT
        DATE(created_at AT TIME ZONE 'UTC')::TEXT AS date,
        COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
      FROM campaigns
      WHERE shop_domain = ${shopDomain}
        AND created_at >= ${start} AND created_at <= ${end}
      GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ORDER BY 1 ASC
    `,
    sql`
      SELECT id, title, delivery_count, click_count, revenue_cents
      FROM campaigns
      WHERE shop_domain = ${shopDomain}
        AND created_at >= ${start} AND created_at <= ${end}
      ORDER BY revenue_cents DESC NULLS LAST
      LIMIT 5
    `,
    sql`
      SELECT
        rule_key,
        COUNT(*)::BIGINT AS impressions,
        COALESCE(SUM(revenue_cents), 0)::BIGINT AS revenue_cents
      FROM automation_deliveries
      WHERE shop_domain = ${shopDomain}
        AND delivered_at >= ${start} AND delivered_at <= ${end}
      GROUP BY rule_key
      ORDER BY revenue_cents DESC NULLS LAST
      LIMIT 5
    `,
    sql`
      SELECT rule_key, COUNT(*)::BIGINT AS clicks
      FROM automation_clicks
      WHERE shop_domain = ${shopDomain}
        AND clicked_at >= ${start} AND clicked_at <= ${end}
      GROUP BY rule_key
    `,
  ]);

  const clicksByRule = new Map(topAutoClickRows.map((r) => [String(r.rule_key), Number(r.clicks ?? 0)]));

  const campaignImpressions = Number(campaignKpiRows[0]?.impressions ?? 0);
  const campaignClicks = Number(campaignKpiRows[0]?.clicks ?? 0);
  const campaignRevenueCents = Number(campaignKpiRows[0]?.revenue_cents ?? 0);

  const autoImpressions = Number(autoDeliveryRows[0]?.impressions ?? 0);
  const autoClicks = Number(autoClickRows[0]?.clicks ?? 0);
  const autoRevenueCents =
    Number(autoDeliveryRows[0]?.revenue_cents ?? 0) + Number(autoClickRows[0]?.revenue_cents ?? 0);

  const totalImpressions = campaignImpressions + autoImpressions;
  const totalClicks = campaignClicks + autoClicks;
  const totalRevenueCents = campaignRevenueCents + autoRevenueCents;

  const ruleKeyLabels: Record<string, string> = {
    welcome_subscriber: 'Welcome notifications',
    browse_abandonment_15m: 'Browse abandonment',
    cart_abandonment_30m: 'Abandoned cart recovery',
    checkout_abandonment_30m: 'Checkout abandonment',
    shipping_notifications: 'Shipping notifications',
    back_in_stock: 'Back in stock',
    price_drop: 'Price drop',
    win_back_7d: 'Win-back',
    post_purchase_followup: 'Post-purchase follow-up',
  };

  return {
    kpis: {
      totalRevenueCents,
      totalImpressions,
      totalClicks,
      avgCtrPercent: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      newSubscribers: Number(subscriberRows[0]?.count ?? 0),
    },
    dailyRevenue: dailyRevenueRows.map((r) => ({
      date: String(r.date),
      revenueCents: Number(r.revenue_cents ?? 0),
    })),
    topCampaigns: topCampaignRows.map((r) => ({
      id: String(r.id),
      title: String(r.title ?? 'Untitled'),
      impressions: Number(r.delivery_count ?? 0),
      clicks: Number(r.click_count ?? 0),
      revenueCents: Number(r.revenue_cents ?? 0),
    })),
    topAutomations: topAutoRows.map((r) => ({
      ruleKey: String(r.rule_key),
      name: ruleKeyLabels[String(r.rule_key)] ?? String(r.rule_key),
      impressions: Number(r.impressions ?? 0),
      clicks: clicksByRule.get(String(r.rule_key)) ?? 0,
      revenueCents: Number(r.revenue_cents ?? 0),
    })),
    attribution: {
      campaignRevenueCents,
      automationRevenueCents: autoRevenueCents,
    },
  };
};

export const listDueScheduledCampaigns = async (limit = 25, shardCount = 1, shardIndex = 0) => {
  await ensureSchema();
  const sql = getNeonSql();

  const safeShardCount = Math.max(1, Math.min(Number(shardCount) || 1, 128));
  const safeShardIndex = Math.max(0, Math.min(Number(shardIndex) || 0, safeShardCount - 1));

  const rows = await sql`
    SELECT id, shop_domain, scheduled_at
    FROM campaigns
    WHERE status = 'scheduled'
      AND scheduled_at IS NOT NULL
      AND scheduled_at <= NOW()
      AND (
        ${safeShardCount} = 1
        OR MOD(ABS(hashtext(id)), ${safeShardCount}) = ${safeShardIndex}
      )
    ORDER BY scheduled_at ASC
    LIMIT ${limit}
  `;

  return rows as Array<{ id: string; shop_domain: string; scheduled_at: string | Date | null }>;
};

export const sendCampaign = async (
  shopDomain: string,
  campaignId: string,
  options?: { maxBatches?: number },
) => {
  await ensureSchema();
  const sql = getNeonSql();
  const maxBatches = Math.max(1, Math.min(Number(options?.maxBatches ?? Number.MAX_SAFE_INTEGER), 2000));

  const campaignRows = await sql`
    UPDATE campaigns
    SET status = 'sending'
    WHERE id = ${campaignId}
      AND shop_domain = ${shopDomain}
      AND status IN ('draft', 'scheduled', 'queued')
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
        windows_image_url: string | null;
        macos_image_url: string | null;
        android_image_url: string | null;
        action_buttons: unknown;
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

  const recipients = await resolveCampaignAudience(shopDomain, campaign.segment_id, campaignId);

  if (recipients.length === 0) {
    const deliveredRows = await sql`
      SELECT COUNT(*)::INT AS count
      FROM campaign_deliveries
      WHERE campaign_id = ${campaignId}
    `;

    const alreadyDelivered = Number(deliveredRows[0]?.count ?? 0);

    if (alreadyDelivered > 0) {
      await sql`
        UPDATE campaigns
        SET status = 'sent', sent_at = COALESCE(sent_at, NOW()), delivery_count = ${alreadyDelivered}
        WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
      `;

      return {
        successCount: 0,
        failureCount: 0,
        recipientCount: alreadyDelivered,
        completed: true,
        remainingRecipients: 0,
      };
    }

    await sql`
      UPDATE campaigns
      SET status = ${previousStatus}, sent_at = NULL, delivery_count = 0
      WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
    `;

    throw new Error('No active browser notification tokens found for this audience. Ask visitors to allow notifications first.');
  }

  try {
    const messaging = getFirebaseAdminMessaging();
    const chunkSize = 500;
    let successCount = 0;
    let failureCount = 0;
    let processedBatches = 0;
    let processedRecipients = 0;

    for (let i = 0; i < recipients.length; i += chunkSize) {
      if (processedBatches >= maxBatches) {
        break;
      }

      const chunk = recipients.slice(i, i + chunkSize);
      const chunkWithPayload = chunk.map((item) => {
        const platform = String((item as { platform?: string }).platform ?? '').toLowerCase();
        const platformImage =
          platform === 'windows'
            ? campaign.windows_image_url
            : platform === 'android'
              ? campaign.android_image_url
              : campaign.macos_image_url ?? campaign.image_url;

        const trackedUrl = buildTrackedUrl(campaign.target_url, campaignId, shopDomain, item.external_id, 'primary');
        const actionButtons = Array.isArray(campaign.action_buttons)
          ? (campaign.action_buttons as Array<{ title?: string; link?: string }>)
          : [];

        const actions = actionButtons
          .slice(0, 2)
          .filter((button) => button?.title && button?.link)
          .map((button, buttonIndex) => ({
            action: `btn_${buttonIndex + 1}`,
            title: String(button.title),
            icon: undefined,
          }));

        const firstButtonUrl = actionButtons[0]?.link
          ? buildTrackedUrl(String(actionButtons[0].link), campaignId, shopDomain, item.external_id, 'button_1')
          : null;
        const secondButtonUrl = actionButtons[1]?.link
          ? buildTrackedUrl(String(actionButtons[1].link), campaignId, shopDomain, item.external_id, 'button_2')
          : null;

        return {
          item,
          platformImage,
          trackedUrl,
          firstButtonUrl,
          secondButtonUrl,
          actions,
        };
      });

      const fcmRecipients = chunkWithPayload.filter(({ item }) => String((item as { token_type?: string | null }).token_type ?? 'fcm') !== 'vapid');
      const vapidRecipients = chunkWithPayload.filter(({ item }) => String((item as { token_type?: string | null }).token_type ?? 'fcm') === 'vapid');

      if (fcmRecipients.length > 0) {
        const messages = fcmRecipients.map(({ item, platformImage, trackedUrl, firstButtonUrl, secondButtonUrl, actions }) => ({
          token: item.fcm_token,
          notification: {
            title: campaign.title,
            body: campaign.body,
            imageUrl: platformImage ?? undefined,
          },
          webpush: {
            fcmOptions: {
              link: trackedUrl ?? undefined,
            },
            notification: {
              icon: campaign.icon_url ?? undefined,
              image: platformImage ?? undefined,
              actions: actions.length > 0 ? actions : undefined,
            },
          },
          data: {
            campaignId,
            shopDomain,
            primaryUrl: trackedUrl ?? '',
            button1Url: firstButtonUrl ?? '',
            button2Url: secondButtonUrl ?? '',
            action1Title: actions[0]?.title ?? '',
            action2Title: actions[1]?.title ?? '',
          },
        }));

        const multicast = await messaging.sendEach(messages);

        successCount += multicast.successCount;
        failureCount += multicast.failureCount;

        for (let index = 0; index < multicast.responses.length; index += 1) {
          const response = multicast.responses[index];
          const recipient = fcmRecipients[index]?.item;
          if (!recipient) {
            continue;
          }

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
              ON CONFLICT (campaign_id, token_id) DO NOTHING
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

      for (const { item, platformImage, trackedUrl } of vapidRecipients) {
        try {
          const endpoint = String((item as { vapid_endpoint?: string | null }).vapid_endpoint ?? '');
          const p256dh = String((item as { vapid_p256dh?: string | null }).vapid_p256dh ?? '');
          const auth = String((item as { vapid_auth?: string | null }).vapid_auth ?? '');

          if (!endpoint || !p256dh || !auth) {
            failureCount += 1;
            continue;
          }

          const vapidMessageId = await sendVapidPushNotification(
            { endpoint, keys: { p256dh, auth } },
            {
              title: campaign.title,
              body: campaign.body,
              icon: campaign.icon_url,
              image: platformImage,
              url: trackedUrl,
            },
          );

          successCount += 1;

          await sql`
            INSERT INTO campaign_deliveries (campaign_id, shop_domain, subscriber_id, token_id, fcm_message_id)
            VALUES (
              ${campaignId},
              ${shopDomain},
              ${Number(item.subscriber_id)},
              ${Number(item.token_id)},
              ${vapidMessageId}
            )
            ON CONFLICT (campaign_id, token_id) DO NOTHING
          `;
        } catch (error) {
          failureCount += 1;

          const message = error instanceof Error ? error.message : String(error ?? '');
          if (message.includes('410') || message.includes('404') || message.toLowerCase().includes('unsub')) {
            await sql`
              UPDATE subscriber_tokens
              SET status = 'revoked', updated_at = NOW()
              WHERE id = ${Number(item.token_id)}
            `;
          }
        }
      }

      processedRecipients += chunk.length;
      processedBatches += 1;
    }

    const remainingRecipients = Math.max(recipients.length - processedRecipients, 0);

    if (remainingRecipients > 0) {
      await sql`
        UPDATE campaigns
        SET
          status = 'queued',
          delivery_count = COALESCE(delivery_count, 0) + ${successCount}
        WHERE id = ${campaignId}
      `;

      return {
        successCount,
        failureCount,
        recipientCount: recipients.length,
        completed: false,
        remainingRecipients,
      };
    }

    const deliveredRows = await sql`
      SELECT COUNT(*)::INT AS count
      FROM campaign_deliveries
      WHERE campaign_id = ${campaignId}
    `;

    const deliveredCount = Number(deliveredRows[0]?.count ?? 0);

    await sql`
      UPDATE campaigns
      SET
        status = 'sent',
        sent_at = NOW(),
        delivery_count = ${deliveredCount}
      WHERE id = ${campaignId}
    `;

    return {
      successCount,
      failureCount,
      recipientCount: recipients.length,
      completed: true,
      remainingRecipients: 0,
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

export const createMediaAsset = async (input: {
  shopDomain: string;
  contentType: string;
  dataBase64?: string | null;
  objectKey?: string | null;
  publicUrl?: string | null;
}) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  const assetId = randomUUID();

  await sql`
    INSERT INTO media_assets (id, shop_domain, content_type, data_base64, object_key, public_url)
    VALUES (
      ${assetId},
      ${input.shopDomain},
      ${input.contentType},
      ${input.dataBase64 ?? null},
      ${input.objectKey ?? null},
      ${input.publicUrl ?? null}
    )
  `;

  return {
    id: assetId,
    url: input.publicUrl?.trim() || `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/media/${assetId}`,
  };
};

export const getMediaAsset = async (assetId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const rows = await sql`
    SELECT id, shop_domain, content_type, data_base64, object_key, public_url, created_at
    FROM media_assets
    WHERE id = ${assetId}
    LIMIT 1
  `;

  return (rows[0] ?? null) as
    | {
        id: string;
        shop_domain: string;
        content_type: string;
        data_base64: string | null;
        object_key: string | null;
        public_url: string | null;
        created_at: string | Date;
      }
    | null;
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

  const existingRows = await sql`
    SELECT opt_in_logo_url
    FROM merchant_settings
    WHERE shop_domain = ${input.shopDomain}
    LIMIT 1
  `;
  const previousLogoUrl = existingRows[0]?.opt_in_logo_url ? String(existingRows[0].opt_in_logo_url) : null;

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

  if (previousLogoUrl && previousLogoUrl !== (input.logoUrl ?? null)) {
    await cleanupUnusedMediaAssets(input.shopDomain, [previousLogoUrl]);
  }

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

export const getPrivacySettings = async (shopDomain: string): Promise<PrivacySettings> => {
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
      support_tools_enabled,
      ip_address_option,
      geo_location_enabled,
      notification_preferences_enabled,
      email_store_option,
      location_store_option,
      name_store_option
    FROM merchant_settings
    WHERE shop_domain = ${shopDomain}
    LIMIT 1
  `;

  const row = rows[0];

  return {
    allowSupport: row?.support_tools_enabled === undefined ? defaultPrivacySettings.allowSupport : Boolean(row.support_tools_enabled),
    ipAddressOption: (row?.ip_address_option as PrivacySettings['ipAddressOption']) ?? defaultPrivacySettings.ipAddressOption,
    enableGeo: row?.geo_location_enabled === undefined ? defaultPrivacySettings.enableGeo : Boolean(row.geo_location_enabled),
    enablePreferences:
      row?.notification_preferences_enabled === undefined
        ? defaultPrivacySettings.enablePreferences
        : Boolean(row.notification_preferences_enabled),
    emailStoreOption: (row?.email_store_option as PrivacySettings['emailStoreOption']) ?? defaultPrivacySettings.emailStoreOption,
    locationStoreOption: (row?.location_store_option as PrivacySettings['locationStoreOption']) ?? defaultPrivacySettings.locationStoreOption,
    nameStoreOption: (row?.name_store_option as PrivacySettings['nameStoreOption']) ?? defaultPrivacySettings.nameStoreOption,
  };
};

export const updatePrivacySettings = async (input: UpdatePrivacySettingsInput): Promise<PrivacySettings> => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  await sql`
    INSERT INTO merchant_settings (
      shop_domain,
      support_tools_enabled,
      ip_address_option,
      geo_location_enabled,
      notification_preferences_enabled,
      email_store_option,
      location_store_option,
      name_store_option,
      updated_at
    )
    VALUES (
      ${input.shopDomain},
      ${input.allowSupport},
      ${input.ipAddressOption},
      ${input.enableGeo},
      ${input.enablePreferences},
      ${input.emailStoreOption},
      ${input.locationStoreOption},
      ${input.nameStoreOption},
      NOW()
    )
    ON CONFLICT (shop_domain)
    DO UPDATE SET
      support_tools_enabled = EXCLUDED.support_tools_enabled,
      ip_address_option = EXCLUDED.ip_address_option,
      geo_location_enabled = EXCLUDED.geo_location_enabled,
      notification_preferences_enabled = EXCLUDED.notification_preferences_enabled,
      email_store_option = EXCLUDED.email_store_option,
      location_store_option = EXCLUDED.location_store_option,
      name_store_option = EXCLUDED.name_store_option,
      updated_at = NOW()
  `;

  return {
    allowSupport: Boolean(input.allowSupport),
    ipAddressOption: input.ipAddressOption,
    enableGeo: Boolean(input.enableGeo),
    enablePreferences: Boolean(input.enablePreferences),
    emailStoreOption: input.emailStoreOption,
    locationStoreOption: input.locationStoreOption,
    nameStoreOption: input.nameStoreOption,
  };
};

export const getBrandingSettings = async (shopDomain: string): Promise<BrandingSettings> => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(shopDomain);

  await sql`
    INSERT INTO merchant_settings (shop_domain)
    VALUES (${shopDomain})
    ON CONFLICT (shop_domain) DO NOTHING
  `;

  const rows = await sql`
    SELECT brand_logo_url
    FROM merchant_settings
    WHERE shop_domain = ${shopDomain}
    LIMIT 1
  `;

  return {
    logoUrl: rows[0]?.brand_logo_url ? String(rows[0].brand_logo_url) : null,
  };
};

export const updateBrandingSettings = async (input: UpdateBrandingSettingsInput): Promise<BrandingSettings> => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  const existingRows = await sql`
    SELECT brand_logo_url
    FROM merchant_settings
    WHERE shop_domain = ${input.shopDomain}
    LIMIT 1
  `;
  const previousLogoUrl = existingRows[0]?.brand_logo_url ? String(existingRows[0].brand_logo_url) : null;

  await sql`
    INSERT INTO merchant_settings (shop_domain, brand_logo_url, updated_at)
    VALUES (${input.shopDomain}, ${input.logoUrl ?? null}, NOW())
    ON CONFLICT (shop_domain)
    DO UPDATE SET
      brand_logo_url = EXCLUDED.brand_logo_url,
      updated_at = NOW()
  `;

  if (previousLogoUrl && previousLogoUrl !== (input.logoUrl ?? null)) {
    await cleanupUnusedMediaAssets(input.shopDomain, [previousLogoUrl]);
  }

  return {
    logoUrl: input.logoUrl ?? null,
  };
};

export const getWelcomeAutomationDiagnostics = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const ruleRows = await sql`
    SELECT config
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
    LIMIT 1
  `;

  const merchantRows = await sql`
    SELECT m.primary_domain, m.myshopify_domain, s.brand_logo_url, s.opt_in_logo_url
    FROM merchants m
    LEFT JOIN merchant_settings s ON s.shop_domain = m.shop_domain
    WHERE m.shop_domain = ${shopDomain}
    LIMIT 1
  `;

  const jobsByStepStatusRows = await sql`
    SELECT
      COALESCE(j.payload -> 'metadata' ->> 'stepKey', 'unknown') AS step_key,
      j.status,
      COUNT(*)::INT AS total,
      COUNT(*) FILTER (WHERE j.status = 'pending' AND j.due_at <= NOW())::INT AS due_now,
      MAX(j.updated_at) AS last_updated_at
    FROM automation_jobs j
    WHERE j.shop_domain = ${shopDomain}
      AND j.rule_key = 'welcome_subscriber'
      AND COALESCE(j.payload -> 'metadata' ->> 'stepKey', '') IN ('reminder-1', 'reminder-2', 'reminder-3')
    GROUP BY step_key, j.status
    ORDER BY step_key ASC, j.status ASC
  `;

  const deliveryRows = await sql`
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

  const staleProcessingRows = await sql`
    SELECT COUNT(*)::INT AS stale_processing
    FROM automation_jobs
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
      AND status = 'processing'
      AND updated_at < NOW() - INTERVAL '10 minutes'
      AND COALESCE(payload -> 'metadata' ->> 'stepKey', '') IN ('reminder-2', 'reminder-3')
  `;

  const recentRows = await sql`
    SELECT
      j.id,
      COALESCE(j.payload -> 'metadata' ->> 'stepKey', 'unknown') AS step_key,
      j.status,
      j.attempts,
      j.due_at,
      j.sent_at,
      j.updated_at,
      j.error_message,
      j.payload -> 'metadata' -> 'actionButtons' AS action_buttons,
      j.token_id,
      j.subscriber_id,
      j.payload ->> 'externalId' AS external_id,
      t.status AS token_status,
      t.last_seen_at,
      s.browser AS subscriber_browser,
      s.platform AS subscriber_platform
    FROM automation_jobs j
    LEFT JOIN subscriber_tokens t ON t.id = j.token_id
    LEFT JOIN subscribers s ON s.id = j.subscriber_id
    WHERE j.shop_domain = ${shopDomain}
      AND j.rule_key = 'welcome_subscriber'
      AND COALESCE(j.payload -> 'metadata' ->> 'stepKey', '') IN ('reminder-2', 'reminder-3')
    ORDER BY j.created_at DESC
    LIMIT 40
  `;

  const summary = {
    reminder2: {
      pending: 0,
      dueNow: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      processing: 0,
      delivered: 0,
      lastDeliveredAt: null as string | null,
    },
    reminder3: {
      pending: 0,
      dueNow: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      processing: 0,
      delivered: 0,
      lastDeliveredAt: null as string | null,
    },
    staleProcessing: Number(staleProcessingRows[0]?.stale_processing ?? 0),
  };

  for (const row of jobsByStepStatusRows as Array<{ step_key: string; status: string; total: number; due_now: number }>) {
    const stepKey = String(row.step_key);
    const bucket = stepKey === 'reminder-2' ? summary.reminder2 : stepKey === 'reminder-3' ? summary.reminder3 : null;
    if (!bucket) {
      continue;
    }

    const status = String(row.status);
    const total = Number(row.total ?? 0);
    if (status === 'pending') {
      bucket.pending += total;
      bucket.dueNow += Number(row.due_now ?? 0);
    } else if (status === 'sent') {
      bucket.sent += total;
    } else if (status === 'failed') {
      bucket.failed += total;
    } else if (status === 'skipped') {
      bucket.skipped += total;
    } else if (status === 'processing') {
      bucket.processing += total;
    }
  }

  for (const row of deliveryRows as Array<{ step_key: string; delivered: number; last_delivered_at: string | null }>) {
    const stepKey = String(row.step_key);
    const bucket = stepKey === 'reminder-2' ? summary.reminder2 : stepKey === 'reminder-3' ? summary.reminder3 : null;
    if (!bucket) {
      continue;
    }

    bucket.delivered = Number(row.delivered ?? 0);
    bucket.lastDeliveredAt = row.last_delivered_at ? new Date(row.last_delivered_at).toISOString() : null;
  }

  const inferredIssues: string[] = [];
  if (summary.reminder2.dueNow > 0 || summary.reminder3.dueNow > 0) {
    inferredIssues.push('Due delayed welcome jobs exist; cron/processing path should pick them immediately.');
  }
  if (summary.reminder2.failed > 0 || summary.reminder3.failed > 0) {
    inferredIssues.push('Some delayed jobs are failed; review recent error_message values and token_status.');
  }
  if (summary.staleProcessing > 0) {
    inferredIssues.push('Stale processing jobs detected (>10m); worker interruption/backpressure likely occurred.');
  }
  if (summary.reminder2.sent === 0 && summary.reminder2.pending === 0 && summary.reminder2.failed === 0) {
    inferredIssues.push('No reminder-2 jobs found; welcome step enqueue path may not be creating delayed jobs.');
  }
  if (summary.reminder3.sent === 0 && summary.reminder3.pending === 0 && summary.reminder3.failed === 0) {
    inferredIssues.push('No reminder-3 jobs found; welcome step enqueue path may not be creating delayed jobs.');
  }

  const welcomeConfig = parseWelcomeRuleConfig(ruleRows[0]?.config ?? null);
  const storeBase = toAbsoluteStorefrontUrl(
    merchantRows[0]?.primary_domain ?? merchantRows[0]?.myshopify_domain ?? shopDomain,
    shopDomain,
  );

  const mediaStatus = (value: string | null | undefined) => {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return {
        present: false,
        raw: null,
        scheme: 'none',
        normalized: null,
      };
    }

    const normalized = toHttpUrlOrNull(raw, storeBase);
    const scheme = raw.startsWith('https://')
      ? 'https'
      : raw.startsWith('http://')
        ? 'http'
        : raw.startsWith('data:')
          ? 'data'
          : raw.startsWith('blob:')
            ? 'blob'
            : 'relative-or-invalid';

    return {
      present: true,
      raw,
      scheme,
      normalized,
    };
  };

  const reminderMedia = {
    'reminder-1': {
      icon: mediaStatus(welcomeConfig.steps['reminder-1'].iconUrl ?? null),
      image: mediaStatus(welcomeConfig.steps['reminder-1'].imageUrl ?? null),
      windowsImage: mediaStatus(welcomeConfig.steps['reminder-1'].windowsImageUrl ?? null),
      macosImage: mediaStatus(welcomeConfig.steps['reminder-1'].macosImageUrl ?? null),
      androidImage: mediaStatus(welcomeConfig.steps['reminder-1'].androidImageUrl ?? null),
    },
    'reminder-2': {
      icon: mediaStatus(welcomeConfig.steps['reminder-2'].iconUrl ?? null),
      image: mediaStatus(welcomeConfig.steps['reminder-2'].imageUrl ?? null),
      windowsImage: mediaStatus(welcomeConfig.steps['reminder-2'].windowsImageUrl ?? null),
      macosImage: mediaStatus(welcomeConfig.steps['reminder-2'].macosImageUrl ?? null),
      androidImage: mediaStatus(welcomeConfig.steps['reminder-2'].androidImageUrl ?? null),
    },
    'reminder-3': {
      icon: mediaStatus(welcomeConfig.steps['reminder-3'].iconUrl ?? null),
      image: mediaStatus(welcomeConfig.steps['reminder-3'].imageUrl ?? null),
      windowsImage: mediaStatus(welcomeConfig.steps['reminder-3'].windowsImageUrl ?? null),
      macosImage: mediaStatus(welcomeConfig.steps['reminder-3'].macosImageUrl ?? null),
      androidImage: mediaStatus(welcomeConfig.steps['reminder-3'].androidImageUrl ?? null),
    },
  };

  const invalidMediaIssues: string[] = [];
  for (const stepKey of ['reminder-1', 'reminder-2', 'reminder-3'] as const) {
    const stepMedia = reminderMedia[stepKey];
    const entries = [
      ['icon', stepMedia.icon],
      ['image', stepMedia.image],
      ['windowsImage', stepMedia.windowsImage],
      ['macosImage', stepMedia.macosImage],
      ['androidImage', stepMedia.androidImage],
    ] as const;

    for (const [field, item] of entries) {
      if (item.present && !item.normalized) {
        invalidMediaIssues.push(`${stepKey}.${field} uses unsupported URL scheme '${item.scheme}' and will be stripped before send.`);
      }
    }
  }

  inferredIssues.push(...invalidMediaIssues);

  const stepConfig = {
    'reminder-2': {
      enabled: Boolean(welcomeConfig.steps['reminder-2'].enabled),
      targetUrl: welcomeConfig.steps['reminder-2'].targetUrl ?? null,
      actionButtons: welcomeConfig.steps['reminder-2'].actionButtons ?? [],
    },
    'reminder-3': {
      enabled: Boolean(welcomeConfig.steps['reminder-3'].enabled),
      targetUrl: welcomeConfig.steps['reminder-3'].targetUrl ?? null,
      actionButtons: welcomeConfig.steps['reminder-3'].actionButtons ?? [],
    },
  };

  for (const stepKey of ['reminder-2', 'reminder-3'] as const) {
    const buttons = stepConfig[stepKey].actionButtons;
    if (buttons.length > 2) {
      inferredIssues.push(`${stepKey} has more than 2 action buttons configured; only the first 2 can be rendered.`);
    }
    if (buttons.some((button) => !String(button.title ?? '').trim() || !String(button.link ?? '').trim())) {
      inferredIssues.push(`${stepKey} has action buttons with missing title/link; incomplete buttons will be dropped before send.`);
    }
  }

  const recentErrorsByStep = {
    'reminder-2': (recentRows as Array<Record<string, unknown>>)
      .filter((row) => String(row.step_key ?? '') === 'reminder-2' && row.error_message)
      .slice(0, 5)
      .map((row) => String(row.error_message)),
    'reminder-3': (recentRows as Array<Record<string, unknown>>)
      .filter((row) => String(row.step_key ?? '') === 'reminder-3' && row.error_message)
      .slice(0, 5)
      .map((row) => String(row.error_message)),
  };

  return {
    shopDomain,
    checkedAt: new Date().toISOString(),
    summary,
    stepConfig,
    recentErrorsByStep,
    reminderMedia,
    inferredIssues,
    recentJobs: (recentRows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id ?? ''),
      stepKey: String(row.step_key ?? ''),
      status: String(row.status ?? ''),
      attempts: Number(row.attempts ?? 0),
      dueAt: row.due_at ? new Date(String(row.due_at)).toISOString() : null,
      sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
      updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
      errorMessage: row.error_message ? String(row.error_message) : null,
      actionButtons: Array.isArray(row.action_buttons)
        ? (row.action_buttons as Array<Record<string, unknown>>).map((button) => ({
            title: String(button.title ?? ''),
            link: String(button.link ?? ''),
          }))
        : [],
      tokenId: row.token_id == null ? null : Number(row.token_id),
      subscriberId: row.subscriber_id == null ? null : Number(row.subscriber_id),
      externalId: row.external_id ? String(row.external_id) : null,
      tokenStatus: row.token_status ? String(row.token_status) : null,
      tokenLastSeenAt: row.last_seen_at ? new Date(String(row.last_seen_at)).toISOString() : null,
      browser: row.subscriber_browser ? String(row.subscriber_browser) : null,
      platform: row.subscriber_platform ? String(row.subscriber_platform) : null,
    })),
  };
};

export const clearWelcomeAutomationHistory = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const deliveryRows = await sql`
    DELETE FROM automation_deliveries
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
    RETURNING id
  `;

  const clickRows = await sql`
    DELETE FROM automation_clicks
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
    RETURNING id
  `;

  const jobRows = await sql`
    DELETE FROM automation_jobs
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
    RETURNING id
  `;

  return {
    clearedJobs: jobRows.length,
    clearedDeliveries: deliveryRows.length,
    clearedClicks: clickRows.length,
    clearedAt: new Date().toISOString(),
  };
};

export const recordStorefrontTokenDiagnostic = async (input: RecordStorefrontTokenDiagnosticInput) => {
  await ensureSchema();
  const sql = getNeonSql();

  await ensureMerchant(input.shopDomain);

  await sql`
    INSERT INTO storefront_token_diagnostics (
      shop_domain,
      external_id,
      event_type,
      status,
      reason,
      message,
      token_type,
      browser,
      platform,
      locale,
      permission_state,
      endpoint,
      details
    )
    VALUES (
      ${input.shopDomain},
      ${input.externalId ?? null},
      ${String(input.eventType || 'unknown')},
      ${input.status ?? 'info'},
      ${input.reason ?? null},
      ${input.message ?? null},
      ${input.tokenType ?? null},
      ${input.browser ?? null},
      ${input.platform ?? null},
      ${input.locale ?? null},
      ${input.permissionState ?? null},
      ${input.endpoint ?? null},
      ${input.details ? JSON.stringify(input.details) : null}::jsonb
    )
  `;
};

export const getStorefrontDiagnostics = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const tokenSummaryRows = await sql`
    SELECT
      COALESCE(NULLIF(token_type, ''), 'fcm') AS token_type,
      COALESCE(NULLIF(status, ''), 'unknown') AS status,
      COUNT(*)::INT AS total
    FROM subscriber_tokens
    WHERE shop_domain = ${shopDomain}
    GROUP BY 1, 2
    ORDER BY 1 ASC, 2 ASC
  `;

  const recentTokenRows = await sql`
    SELECT
      t.id,
      t.fcm_token,
      t.token_type,
      t.status,
      t.updated_at,
      t.last_seen_at,
      s.external_id,
      s.browser,
      s.platform
    FROM subscriber_tokens t
    LEFT JOIN subscribers s ON s.id = t.subscriber_id
    WHERE t.shop_domain = ${shopDomain}
    ORDER BY t.updated_at DESC NULLS LAST, t.last_seen_at DESC NULLS LAST
    LIMIT 30
  `;

  const recentDiagnosticRows = await sql`
    SELECT
      id,
      event_type,
      status,
      reason,
      message,
      token_type,
      browser,
      platform,
      locale,
      permission_state,
      endpoint,
      external_id,
      details,
      created_at
    FROM storefront_token_diagnostics
    WHERE shop_domain = ${shopDomain}
    ORDER BY created_at DESC
    LIMIT 80
  `;

  const recentWelcomeJobs = await sql`
    SELECT
      j.id,
      COALESCE(j.payload -> 'metadata' ->> 'stepKey', 'unknown') AS step_key,
      j.status,
      j.error_message,
      j.updated_at,
      j.sent_at,
      j.payload ->> 'externalId' AS external_id
    FROM automation_jobs j
    WHERE j.shop_domain = ${shopDomain}
      AND j.rule_key = 'welcome_subscriber'
    ORDER BY j.updated_at DESC
    LIMIT 40
  `;

  const failureRows = await sql`
    SELECT
      COALESCE(NULLIF(reason, ''), 'unknown') AS reason,
      COUNT(*)::INT AS total
    FROM storefront_token_diagnostics
    WHERE shop_domain = ${shopDomain}
      AND status = 'error'
      AND created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY 1
    ORDER BY total DESC
    LIMIT 10
  `;

  const tokenSummary = (tokenSummaryRows as Array<Record<string, unknown>>).map((row) => ({
    tokenType: String(row.token_type ?? 'fcm'),
    status: String(row.status ?? 'unknown'),
    total: Number(row.total ?? 0),
  }));

  const issues: string[] = [];
  const activeTokens = tokenSummary
    .filter((item) => item.status === 'active')
    .reduce((sum, item) => sum + item.total, 0);

  if (activeTokens === 0) {
    issues.push('No active subscriber tokens found for this shop. Real notifications cannot be delivered.');
  }

  const diagnosticsInLastHour = (recentDiagnosticRows as Array<Record<string, unknown>>)
    .filter((row) => {
      const createdAtRaw = row.created_at ? new Date(String(row.created_at)).getTime() : 0;
      return createdAtRaw > Date.now() - 60 * 60 * 1000;
    });

  const hasRecentTokenSaveFailures = diagnosticsInLastHour.some(
    (row) => String(row.reason ?? '') === 'token-save-failed' || String(row.reason ?? '') === 'token-empty',
  );
  const hasRecentTokenSuccess = diagnosticsInLastHour.some((row) => String(row.event_type ?? '') === 'token_register_success');
  if (hasRecentTokenSaveFailures && !hasRecentTokenSuccess) {
    issues.push('Token registration failures were detected recently without any success event in the last hour.');
  }

  if (!env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
    issues.push('NEXT_PUBLIC_FIREBASE_VAPID_KEY is empty; browser token generation can fail on some devices.');
  }

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    issues.push('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not fully configured; Firefox/Safari delivery can fail.');
  }

  return {
    shopDomain,
    checkedAt: new Date().toISOString(),
    tokenSummary,
    recentFailures: (failureRows as Array<Record<string, unknown>>).map((row) => ({
      reason: String(row.reason ?? 'unknown'),
      total: Number(row.total ?? 0),
    })),
    recentDiagnostics: (recentDiagnosticRows as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id ?? 0),
      eventType: String(row.event_type ?? ''),
      status: String(row.status ?? ''),
      reason: row.reason ? String(row.reason) : null,
      message: row.message ? String(row.message) : null,
      tokenType: row.token_type ? String(row.token_type) : null,
      browser: row.browser ? String(row.browser) : null,
      platform: row.platform ? String(row.platform) : null,
      locale: row.locale ? String(row.locale) : null,
      permissionState: row.permission_state ? String(row.permission_state) : null,
      endpoint: row.endpoint ? String(row.endpoint) : null,
      externalId: row.external_id ? String(row.external_id) : null,
      details: row.details && typeof row.details === 'object' ? (row.details as Record<string, unknown>) : null,
      createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : null,
    })),
    recentTokens: (recentTokenRows as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id ?? 0),
      tokenType: String(row.token_type ?? 'fcm'),
      status: String(row.status ?? ''),
      tokenPreview: String(row.fcm_token ?? '').slice(0, 22),
      updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
      lastSeenAt: row.last_seen_at ? new Date(String(row.last_seen_at)).toISOString() : null,
      externalId: row.external_id ? String(row.external_id) : null,
      browser: row.browser ? String(row.browser) : null,
      platform: row.platform ? String(row.platform) : null,
    })),
    recentWelcomeJobs: (recentWelcomeJobs as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id ?? ''),
      stepKey: String(row.step_key ?? ''),
      status: String(row.status ?? ''),
      errorMessage: row.error_message ? String(row.error_message) : null,
      updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : null,
      sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null,
      externalId: row.external_id ? String(row.external_id) : null,
    })),
    issues,
    env: {
      firebaseVapidConfigured: Boolean(env.NEXT_PUBLIC_FIREBASE_VAPID_KEY),
      webPushVapidConfigured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
    },
  };
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

export const trackAutomationClick = async (input: TrackAutomationClickInput) => {
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
    INSERT INTO automation_clicks (
      rule_key,
      shop_domain,
      subscriber_id,
      external_id,
      target_url,
      user_agent,
      ip_address,
      referrer
    )
    VALUES (
      ${input.ruleKey},
      ${input.shopDomain},
      ${subscriberId},
      ${input.externalId ?? null},
      ${input.targetUrl},
      ${input.userAgent ?? null},
      ${input.ipAddress ?? null},
      ${input.referrer ?? null}
    )
  `;

  await sql`
    UPDATE automation_deliveries
    SET clicked_at = NOW()
    WHERE id = (
      SELECT id
      FROM automation_deliveries
      WHERE shop_domain = ${input.shopDomain}
        AND rule_key = ${input.ruleKey}
        AND (${input.externalId ?? null} IS NULL OR external_id = ${input.externalId ?? null})
        AND clicked_at IS NULL
      ORDER BY delivered_at DESC
      LIMIT 1
    )
  `;
};

export const recordAttributedConversion = async (input: RecordConversionInput) => {
  await ensureSchema();
  const sql = getNeonSql();

  const settings = await getAttributionSettings(input.shopDomain);
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  const normalizedEmail = input.email?.trim().toLowerCase() ?? null;
  const emailExternalId = normalizedEmail
    ? `email:${createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 24)}`
    : null;
  const customerExternalId = input.customerId?.trim() ? `shopify_customer:${input.customerId.trim()}` : null;

  const externalIdCandidates = Array.from(
    new Set(
      [input.externalId?.trim() ?? null, customerExternalId, emailExternalId].filter((value): value is string => Boolean(value)),
    ),
  );

  const existingAttribution = await sql`
    SELECT campaign_id
    FROM campaign_deliveries
    WHERE shop_domain = ${input.shopDomain}
      AND order_id = ${input.orderId}
    UNION ALL
    SELECT campaign_id
    FROM campaign_clicks
    WHERE shop_domain = ${input.shopDomain}
      AND order_id = ${input.orderId}
    LIMIT 1
  `;

  const existingAutomationAttribution = await sql`
    SELECT id
    FROM automation_deliveries
    WHERE shop_domain = ${input.shopDomain}
      AND order_id = ${input.orderId}
    UNION ALL
    SELECT id
    FROM automation_clicks
    WHERE shop_domain = ${input.shopDomain}
      AND order_id = ${input.orderId}
    LIMIT 1
  `;

  if (existingAttribution[0]?.campaign_id) {
    return { attributed: true, campaignId: String(existingAttribution[0].campaign_id), model: settings.attributionModel };
  }

  if (existingAutomationAttribution[0]?.id) {
    return { attributed: true, campaignId: null, model: settings.attributionModel };
  }

  if (settings.attributionModel === 'click') {
    const clickWindowHours = Math.max(1, settings.clickWindowDays) * 24;
    const clickCandidates = externalIdCandidates.length > 0
      ? await sql`
        SELECT c.id, c.campaign_id
        FROM campaign_clicks c
        JOIN subscribers s ON s.id = c.subscriber_id
        WHERE c.shop_domain = ${input.shopDomain}
          AND s.external_id = ANY(${externalIdCandidates})
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
          AND order_id IS NULL
      `;
    }

    await sql`
      UPDATE campaigns
      SET revenue_cents = revenue_cents + ${input.revenueCents}
      WHERE id = ${matchedCampaignId} AND shop_domain = ${input.shopDomain}
    `;

    return { attributed: true, campaignId: matchedCampaignId, model: 'click' as const };
  }

  const automationClickWindowHours = Math.max(1, settings.clickWindowDays) * 24;
  const automationClickCandidates = externalIdCandidates.length > 0
    ? await sql`
      SELECT id, rule_key
      FROM automation_clicks
      WHERE shop_domain = ${input.shopDomain}
        AND external_id = ANY(${externalIdCandidates})
        AND clicked_at >= ${new Date(occurredAt.getTime() - automationClickWindowHours * 60 * 60 * 1000)}
      ORDER BY clicked_at DESC
      LIMIT 1
    `
    : [];

  if (automationClickCandidates[0]?.id) {
    await sql`
      UPDATE automation_clicks
      SET converted_at = ${occurredAt}, order_id = ${input.orderId}, revenue_cents = ${input.revenueCents}
      WHERE id = ${Number(automationClickCandidates[0].id)}
        AND order_id IS NULL
    `;

    return { attributed: true, campaignId: null, model: 'click' as const };
  }

  const impressionWindowHours = Math.max(1, settings.impressionWindowDays) * 24;
  const deliveryCandidates = externalIdCandidates.length > 0
    ? await sql`
      SELECT d.id, d.campaign_id
      FROM campaign_deliveries d
      JOIN subscribers s ON s.id = d.subscriber_id
      WHERE d.shop_domain = ${input.shopDomain}
        AND s.external_id = ANY(${externalIdCandidates})
        AND d.delivered_at >= ${new Date(occurredAt.getTime() - impressionWindowHours * 60 * 60 * 1000)}
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `
    : [];

  const matchedDelivery = deliveryCandidates[0];
  const fallbackCampaignDelivery = !matchedDelivery && input.campaignId
    ? await sql`
      SELECT d.id, d.campaign_id
      FROM campaign_deliveries d
      WHERE d.shop_domain = ${input.shopDomain}
        AND d.campaign_id = ${input.campaignId}
        AND d.delivered_at >= ${new Date(occurredAt.getTime() - impressionWindowHours * 60 * 60 * 1000)}
      ORDER BY d.delivered_at DESC
      LIMIT 1
    `
    : [];

  const matched = matchedDelivery ?? fallbackCampaignDelivery[0];
  const matchedCampaignId = (matched?.campaign_id as string | undefined) ?? input.campaignId ?? null;

  const automationDeliveryCandidates = externalIdCandidates.length > 0
    ? await sql`
      SELECT id, rule_key
      FROM automation_deliveries
      WHERE shop_domain = ${input.shopDomain}
        AND external_id = ANY(${externalIdCandidates})
        AND delivered_at >= ${new Date(occurredAt.getTime() - impressionWindowHours * 60 * 60 * 1000)}
      ORDER BY delivered_at DESC
      LIMIT 1
    `
    : [];

  if (matchedCampaignId) {
    if (matched?.id) {
      await sql`
        UPDATE campaign_deliveries
        SET converted_at = ${occurredAt}, order_id = ${input.orderId}, revenue_cents = ${input.revenueCents}
        WHERE id = ${Number(matched.id)}
          AND order_id IS NULL
      `;
    }

    await sql`
      UPDATE campaigns
      SET revenue_cents = revenue_cents + ${input.revenueCents}
      WHERE id = ${matchedCampaignId} AND shop_domain = ${input.shopDomain}
    `;

    return { attributed: true, campaignId: matchedCampaignId, model: 'impression' as const };
  }

  if (automationDeliveryCandidates[0]?.id) {
    await sql`
      UPDATE automation_deliveries
      SET converted_at = ${occurredAt}, order_id = ${input.orderId}, revenue_cents = ${input.revenueCents}
      WHERE id = ${Number(automationDeliveryCandidates[0].id)}
        AND order_id IS NULL
    `;

    return { attributed: true, campaignId: null, model: 'impression' as const };
  }

  return { attributed: false };
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
