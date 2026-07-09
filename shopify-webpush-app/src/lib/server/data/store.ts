import { createHash, randomUUID } from 'crypto';

import { env } from '@/lib/config/env';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { getFirebaseAdminMessaging } from '@/lib/integrations/firebase/admin';
import { sendVapidPushNotification } from '@/lib/integrations/firebase/vapid';
import { buildFcmDataOnlyWebPushMessage } from '@/lib/server/push/fcm-web-push-message';
import { recordPixelEvent } from '@/lib/server/automation/pixel-events';
import {
  COMING_SOON_AUTOMATIONS_ENABLED,
  COMING_SOON_AUTOMATION_RULE_KEYS,
  isComingSoonAutomation,
} from '@/lib/automation-coming-soon';
import {
  buildFlashSaleNotificationBody,
  filterRecipientsForSmartDeliveryHour,
  loadCampaignScheduleMeta,
  upsertCampaignDeliveryOptions,
  type CampaignDeliveryOptions,
} from '@/lib/server/campaigns/delivery-options';
import { deleteImageFromR2, getImageFromR2, replaceImageInR2 } from '@/lib/server/media/r2';
import { compressStoredImageBytes } from '@/lib/server/media/image-compress';
import { pickCampaignBarImageUrl } from '@/lib/campaign-bar-image';
import type { OptInPromptStatsBundle, OptInPromptTypeStats } from '@/lib/types/opt-in-stats';

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
  /** Which opt-in prompt led to this subscription (browser vs custom). */
  optInPromptType?: 'browser' | 'custom' | null;
};

export type OptInPromptType = 'browser' | 'custom';
export type OptInPromptEventType = 'view' | 'click';

type UpdateAttributionSettingsInput = {
  shopDomain: string;
  attributionModel: 'click' | 'impression';
  attributionCreditMode: 'last_touch' | 'all_touches';
  clickWindowDays: number;
  impressionWindowDays: number;
};

type OptInSettings = {
  promptType: 'browser' | 'custom' | 'off';
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
  cartToken?: string | null;
  clientId?: string | null;
  campaignId?: string | null;
  customerId?: string | null;
  email?: string | null;
  ipAddress?: string | null;
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
  eventType: 'page_view' | 'product_view' | 'add_to_cart' | 'checkout_start' | 'checkout_complete';
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
  cartToken?: string | null;
  clientId?: string | null;
  browserIp?: string | null;
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
  shopifyOfflineAccessToken?: string | null;
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
  type: 'country' | 'region' | 'city' | 'tag';
  value: string;
  label?: string;
};

type SegmentCondition = {
  id?: string;
  type:
    | 'Clicked'
    | 'Purchased'
    | 'Purchased a product'
    | 'Purchased from collection'
    | 'Subscribed'
    | 'Location'
    | 'Country'
    | 'City'
    | 'Region'
    | 'Customer tag'
    | 'Custom attribute';
  operator?: 'is' | 'is not' | 'has' | 'has not';
  countOperator?: 'at least once' | 'more than' | 'less than' | 'exactly';
  countValue?: number;
  dateOperator?: 'at any time' | 'before' | 'after' | 'less than' | 'more than' | 'between' | 'in the last';
  dateValue?: { from?: string | Date; to?: string | Date };
  textValue?: string;
  daysValue?: number;
  attributeName?: string;
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

const SCHEMA_READY_KV_KEY = 'pe:schema:ready:v6';
const SCHEMA_READY_TTL_SECONDS = 24 * 60 * 60;

const ensureSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      // The DDL below is idempotent but runs ~40 statements. Once it succeeds we
      // record a short-lived KV flag so subsequent cold starts skip the full sync,
      // saving Neon compute and round-trips. Bump the key version to force a resync.
      try {
        const { isCloudflareKvEnabled, readKvJson } = await import('@/lib/server/cache/cloudflare-kv');
        if (isCloudflareKvEnabled()) {
          const ready = await readKvJson<{ ready?: boolean }>(SCHEMA_READY_KV_KEY);
          if (ready?.ready) {
            return;
          }
        }
      } catch {
        // fall through to the full sync
      }

      const sql = getNeonSql();
      const { getNeonLegacySchemaSkip } = await import('@/lib/server/integrations/neon-legacy-tables');
      const legacySkip = getNeonLegacySchemaSkip();

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
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS shopify_offline_access_token TEXT`;
      await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS shopify_session_synced_at TIMESTAMPTZ`;
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

      if (!legacySkip.customers) {
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
      }

      if (!legacySkip.audience) {
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
      await sql`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS opt_in_prompt_type TEXT`;

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
      }

      await sql`CREATE TABLE IF NOT EXISTS opt_in_prompt_stats (
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        prompt_type TEXT NOT NULL CHECK (prompt_type IN ('browser', 'custom')),
        views BIGINT NOT NULL DEFAULT 0,
        clicks BIGINT NOT NULL DEFAULT 0,
        conversions BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (shop_domain, prompt_type)
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
      await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_recipient_count INTEGER`;

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
        attribution_credit_mode TEXT NOT NULL DEFAULT 'last_touch',
        click_window_days INTEGER NOT NULL DEFAULT 7,
        impression_window_days INTEGER NOT NULL DEFAULT 7,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;

      await sql`ALTER TABLE merchant_settings ADD COLUMN IF NOT EXISTS attribution_credit_mode TEXT NOT NULL DEFAULT 'last_touch'`;

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
      if (!legacySkip.audience) {
      await sql`ALTER TABLE subscriber_tokens ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'fcm'`;
      await sql`ALTER TABLE subscriber_tokens ADD COLUMN IF NOT EXISTS vapid_endpoint TEXT`;
      await sql`ALTER TABLE subscriber_tokens ADD COLUMN IF NOT EXISTS vapid_p256dh TEXT`;
      await sql`ALTER TABLE subscriber_tokens ADD COLUMN IF NOT EXISTS vapid_auth TEXT`;
      }

      if (!legacySkip.deliveries) {
      // Standalone FKs to merchants/campaigns only — do not re-create Neon audience FKs
      // after D1 audience cutover (subscribers/subscriber_tokens may be dropped).
      await sql`CREATE TABLE IF NOT EXISTS campaign_deliveries (
        id BIGSERIAL PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        subscriber_id BIGINT NOT NULL,
        token_id BIGINT NOT NULL,
        fcm_message_id TEXT,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        clicked_at TIMESTAMPTZ,
        converted_at TIMESTAMPTZ,
        order_id TEXT,
        revenue_cents INTEGER NOT NULL DEFAULT 0
      )`;

      await sql`ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS external_id TEXT`;
      await sql`ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS user_agent TEXT`;
      await sql`ALTER TABLE campaign_deliveries ADD COLUMN IF NOT EXISTS ip_address TEXT`;

      await sql`CREATE TABLE IF NOT EXISTS campaign_clicks (
        id BIGSERIAL PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        subscriber_id BIGINT,
        target_url TEXT NOT NULL,
        clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_agent TEXT,
        ip_address TEXT,
        referrer TEXT,
        order_id TEXT,
        converted_at TIMESTAMPTZ,
        revenue_cents INTEGER NOT NULL DEFAULT 0
      )`;

      await sql`ALTER TABLE campaign_clicks ADD COLUMN IF NOT EXISTS external_id TEXT`;

      await sql`CREATE TABLE IF NOT EXISTS automation_deliveries (
        id BIGSERIAL PRIMARY KEY,
        automation_job_id TEXT,
        rule_key TEXT NOT NULL,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        subscriber_id BIGINT,
        token_id BIGINT,
        external_id TEXT,
        target_url TEXT,
        fcm_message_id TEXT,
        delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        clicked_at TIMESTAMPTZ,
        user_agent TEXT,
        ip_address TEXT,
        converted_at TIMESTAMPTZ,
        order_id TEXT,
        revenue_cents INTEGER NOT NULL DEFAULT 0
      )`;
      await sql`ALTER TABLE automation_deliveries ADD COLUMN IF NOT EXISTS user_agent TEXT`;
      await sql`ALTER TABLE automation_deliveries ADD COLUMN IF NOT EXISTS ip_address TEXT`;

      await sql`CREATE TABLE IF NOT EXISTS automation_clicks (
        id BIGSERIAL PRIMARY KEY,
        rule_key TEXT NOT NULL,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        subscriber_id BIGINT,
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
      }

      // Durable, permanent per-rule automation stats. The row-level
      // automation_deliveries / automation_clicks tables are pruned at scale to
      // keep Neon bounded, but merchants must ALWAYS see lifetime automation
      // impressions/clicks/revenue. This table holds the FROZEN aggregate of rows
      // that have already been pruned; all-time stats are then computed as
      // (archived here) + (live SUM of the not-yet-pruned detail). At prune time
      // the rows being deleted are folded into these counters in the SAME atomic
      // statement (see pruneHighVolumeTimeSeries), so the lifetime total is always
      // continuous with zero drift and zero double-counting. Tiny: one row per
      // shop x rule_key (a few hundred rows even at 30 merchants), kept forever.
      await sql`CREATE TABLE IF NOT EXISTS automation_rule_stats (
        shop_domain TEXT NOT NULL,
        rule_key TEXT NOT NULL,
        archived_impressions BIGINT NOT NULL DEFAULT 0,
        archived_clicks BIGINT NOT NULL DEFAULT 0,
        archived_revenue_cents BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (shop_domain, rule_key)
      )`;

      if (!legacySkip.commerce) {
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
      }

      await sql`CREATE TABLE IF NOT EXISTS segments (
        id TEXT PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        name TEXT NOT NULL,
        condition_groups JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, name)
      )`;

      if (!legacySkip.webhooks) {
      await sql`CREATE TABLE IF NOT EXISTS webhook_events (
        id BIGSERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        topic TEXT NOT NULL,
        event_id TEXT NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (shop_domain, topic, event_id)
      )`;
      }

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

      if (!legacySkip.events) {
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
      }

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

      await sql`CREATE TABLE IF NOT EXISTS cron_heartbeats (
        id TEXT PRIMARY KEY,
        job_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        error_message TEXT,
        metadata JSONB
      )`;

      // Zero-loss safety net for d1_only: when the authoritative D1 token write
      // fails, the raw payload is buffered here so a cron reconciler can replay it
      // into D1 (which assigns the id). Deliberately NO foreign key so a missing
      // merchant row can never block a token from being durably captured. Stays
      // near-empty because the reconciler drains it every tick.
      await sql`CREATE TABLE IF NOT EXISTS d1_audience_outbox (
        id BIGSERIAL PRIMARY KEY,
        shop_domain TEXT NOT NULL,
        external_id TEXT NOT NULL,
        fcm_token TEXT NOT NULL,
        payload JSONB NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_d1_audience_outbox_shop_token ON d1_audience_outbox(shop_domain, fcm_token)`;

      await sql`CREATE TABLE IF NOT EXISTS merchant_daily_stats (
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        stat_date DATE NOT NULL,
        campaign_impressions BIGINT NOT NULL DEFAULT 0,
        campaign_clicks BIGINT NOT NULL DEFAULT 0,
        campaign_revenue_cents BIGINT NOT NULL DEFAULT 0,
        automation_impressions BIGINT NOT NULL DEFAULT 0,
        automation_clicks BIGINT NOT NULL DEFAULT 0,
        automation_revenue_cents BIGINT NOT NULL DEFAULT 0,
        new_subscribers BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (shop_domain, stat_date)
      )`;

      await sql`ALTER TABLE segments ADD COLUMN IF NOT EXISTS estimated_subscriber_count INTEGER`;
      await sql`ALTER TABLE segments ADD COLUMN IF NOT EXISTS estimated_count_at TIMESTAMPTZ`;
      await sql`ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS queue_enqueued_at TIMESTAMPTZ`;

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
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_schedules_campaign_id ON campaign_schedules(campaign_id)`;
      await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS flash_sale_enabled BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS flash_sale_ends_at TIMESTAMPTZ`;

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

      if (!legacySkip.catalog) {
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
      }

      if (!legacySkip.commerce) {
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
      }

      // Backfill constraints for legacy databases that were created before unique keys existed.
      if (!legacySkip.audience) {
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
      await sql`CREATE INDEX IF NOT EXISTS idx_subscribers_shop_created ON subscribers(shop_domain, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_tokens_shop_subscriber ON subscriber_tokens(shop_domain, subscriber_id)`;

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
      await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_tokens_shop_status ON subscriber_tokens(shop_domain, status)`;
      }
      if (!legacySkip.webhooks) {
        await sql`CREATE INDEX IF NOT EXISTS idx_webhook_events_shop_received ON webhook_events(shop_domain, received_at DESC)`;
      }

      if (!legacySkip.commerce) {
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
      }

      await sql`CREATE INDEX IF NOT EXISTS idx_campaigns_shop_created ON campaigns(shop_domain, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaigns_shop_scheduled ON campaigns(shop_domain, status, scheduled_at)`;
      if (!legacySkip.events) {
        await sql`CREATE INDEX IF NOT EXISTS idx_pixel_events_shop_created ON pixel_events(shop_domain, created_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_pixel_events_shop_external ON pixel_events(shop_domain, external_id, created_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_pixel_events_shop_cart ON pixel_events(shop_domain, cart_token, created_at DESC) WHERE cart_token IS NOT NULL`;
        await sql`CREATE INDEX IF NOT EXISTS idx_pixel_events_shop_client ON pixel_events(shop_domain, client_id, created_at DESC) WHERE client_id IS NOT NULL`;
      }
      await sql`CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_due ON ingestion_jobs(status, due_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_shop_type ON ingestion_jobs(shop_domain, job_type, status, due_at)`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_ingestion_jobs_dedupe ON ingestion_jobs(shop_domain, job_type, dedupe_key) WHERE dedupe_key IS NOT NULL`;
      await sql`CREATE INDEX IF NOT EXISTS idx_cron_heartbeats_job_started ON cron_heartbeats(job_name, started_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_campaign_schedules_send_at ON campaign_schedules(send_at) WHERE send_at IS NOT NULL`;
      await sql`CREATE INDEX IF NOT EXISTS idx_smart_delivery_metrics_shop ON smart_delivery_metrics(shop_domain)`;
      if (!legacySkip.deliveries) {
        await sql`CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_campaign ON campaign_deliveries(campaign_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_shop_delivered_at ON campaign_deliveries(shop_domain, delivered_at)`;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_deliveries_campaign_token ON campaign_deliveries(campaign_id, token_id)`;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_deliveries_campaign_subscriber ON campaign_deliveries(campaign_id, subscriber_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_campaign_clicks_campaign_time ON campaign_clicks(campaign_id, clicked_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_campaign_clicks_shop_subscriber ON campaign_clicks(shop_domain, subscriber_id, clicked_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_shop_external_time ON campaign_deliveries(shop_domain, external_id, delivered_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_shop_user_agent_time ON campaign_deliveries(shop_domain, user_agent, delivered_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_campaign_clicks_shop_external_time ON campaign_clicks(shop_domain, external_id, clicked_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_automation_deliveries_shop_rule_time ON automation_deliveries(shop_domain, rule_key, delivered_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_automation_deliveries_shop_external_time ON automation_deliveries(shop_domain, external_id, delivered_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_automation_deliveries_shop_user_agent_time ON automation_deliveries(shop_domain, user_agent, delivered_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_automation_clicks_shop_rule_time ON automation_clicks(shop_domain, rule_key, clicked_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_automation_clicks_shop_external_time ON automation_clicks(shop_domain, external_id, clicked_at DESC)`;
      }
      if (!legacySkip.customers) {
        await sql`CREATE INDEX IF NOT EXISTS idx_shopify_customers_shop_email ON shopify_customers(shop_domain, email)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_shopify_customers_shop_external ON shopify_customers(shop_domain, external_id)`;
      }
      if (!legacySkip.commerce) {
        await sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_shop_subscriber ON shopify_orders(shop_domain, subscriber_id, created_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_shopify_orders_shop_external ON shopify_orders(shop_domain, external_id, created_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_shopify_order_items_shop_order ON shopify_order_items(shop_domain, order_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_shopify_order_items_shop_product ON shopify_order_items(shop_domain, product_title)`;
      }
      await sql`CREATE INDEX IF NOT EXISTS idx_segments_shop_created ON segments(shop_domain, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_merchant_daily_stats_shop_date ON merchant_daily_stats(shop_domain, stat_date DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_processed_at ON ingestion_jobs(processed_at) WHERE status = 'processed'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_media_assets_shop_created ON media_assets(shop_domain, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_automation_rules_shop_rule ON automation_rules(shop_domain, rule_key)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_automation_jobs_shop_due ON automation_jobs(shop_domain, status, due_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_automation_jobs_queue_promote ON automation_jobs(status, queue_enqueued_at, due_at) WHERE status = 'pending'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_automation_jobs_shop_payload_external ON automation_jobs(shop_domain, ((payload ->> 'externalId'))) WHERE (payload ->> 'externalId') IS NOT NULL`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_jobs_dedupe ON automation_jobs(shop_domain, dedupe_key) WHERE dedupe_key IS NOT NULL`;
      if (!legacySkip.events) {
        await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_activity_shop_external_created ON subscriber_activity_events(shop_domain, external_id, created_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_activity_shop_product_created ON subscriber_activity_events(shop_domain, product_id, created_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_activity_shop_cart_created ON subscriber_activity_events(shop_domain, cart_token, created_at DESC)`;
      }
      if (!legacySkip.catalog) {
        await sql`CREATE INDEX IF NOT EXISTS idx_shopify_product_variants_shop_variant ON shopify_product_variants(shop_domain, variant_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_shopify_product_variants_shop_inventory ON shopify_product_variants(shop_domain, inventory_item_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_shopify_product_variants_shop_product ON shopify_product_variants(shop_domain, product_id)`;
      }
      if (!legacySkip.commerce) {
        await sql`CREATE INDEX IF NOT EXISTS idx_shopify_fulfillments_shop_order ON shopify_fulfillments(shop_domain, order_id, updated_at DESC)`;
      }

      try {
        const { isCloudflareKvEnabled, writeKvJson } = await import('@/lib/server/cache/cloudflare-kv');
        if (isCloudflareKvEnabled()) {
          void writeKvJson(SCHEMA_READY_KV_KEY, { ready: true }, SCHEMA_READY_TTL_SECONDS).catch(
            () => undefined,
          );
        }
      } catch {
        // ignore — schema is synced, the flag is only an optimization
      }
    })().catch((error) => {
      // Reset so a later request can retry instead of caching a rejected promise.
      schemaReadyPromise = null;
      throw error;
    });
  }

  await schemaReadyPromise;
};

const buildTrackedUrl = (
  targetUrl: string | null | undefined,
  campaignId: string,
  _shopDomain: string,
  _externalId?: string | null,
  contentLabel?: string | null,
) => {
  if (!targetUrl) {
    return null;
  }

  try {
    const target = new URL(unwrapTrackingRedirectUrl(targetUrl));
    target.searchParams.set('utm_source', 'push_eagle');
    target.searchParams.set('utm_medium', 'web_push');
    target.searchParams.set('utm_campaign', campaignId);
    if (contentLabel) {
      target.searchParams.set('utm_content', contentLabel);
    }
    return target.toString();
  } catch {
    return targetUrl;
  }
};

const buildCampaignClickTrackingUrl = (
  trackedTargetUrl: string | null | undefined,
  campaignId: string,
  shopDomain: string,
  externalId?: string | null,
) => {
  if (!trackedTargetUrl) {
    return '';
  }

  const resolveTrackingBase = () => {
    const rawCandidates = [
      env.SHOPIFY_APP_URL,
      env.NEXT_PUBLIC_APP_URL,
      env.SHOPIFY_ROOT_APP_URL,
      'https://push-eagle-dashboard.vercel.app',
    ];

    const candidates: string[] = [];
    for (const raw of rawCandidates) {
      const value = String(raw ?? '').trim();
      if (!value) {
        continue;
      }
      try {
        const parsed = new URL(value);
        if (!/^https?:$/i.test(parsed.protocol)) {
          continue;
        }
        const normalized = parsed.toString().replace(/\/$/, '');
        if (!candidates.includes(normalized)) {
          candidates.push(normalized);
        }

        if (parsed.hostname === 'push-eagle.vercel.app') {
          const dashboardVariant = `${parsed.protocol}//push-eagle-dashboard.vercel.app`;
          if (!candidates.includes(dashboardVariant)) {
            candidates.push(dashboardVariant);
          }
        }
      } catch {
        // Ignore invalid tracking base candidates.
      }
    }

    const dashboardCandidate = candidates.find((item) => {
      try {
        return new URL(item).hostname.includes('dashboard');
      } catch {
        return false;
      }
    });
    if (dashboardCandidate) {
      return dashboardCandidate;
    }

    const nonLocalCandidate = candidates.find((item) => {
      try {
        return new URL(item).hostname !== 'localhost';
      } catch {
        return false;
      }
    });
    return nonLocalCandidate || candidates[0] || '';
  };

  const trackingBase = resolveTrackingBase();

  try {
    const trackerBase = new URL('/api/track/click', trackingBase);
    trackerBase.searchParams.set('c', campaignId);
    trackerBase.searchParams.set('s', shopDomain);
    trackerBase.searchParams.set('u', trackedTargetUrl);
    trackerBase.searchParams.set('nr', '1');
    if (externalId) {
      trackerBase.searchParams.set('e', externalId);
    }
    return trackerBase.toString();
  } catch {
    return '';
  }
};

const buildAutomationTrackedUrl = (
  targetUrl: string | null | undefined,
  ruleKey: AutomationRuleKey,
  _shopDomain: string,
  _externalId?: string | null,
) => {
  if (!targetUrl) {
    return null;
  }

  try {
    const target = new URL(unwrapTrackingRedirectUrl(targetUrl));
    target.searchParams.set('utm_source', 'push_eagle');
    target.searchParams.set('utm_medium', 'web_push');
    target.searchParams.set('utm_campaign', ruleKey);
    return target.toString();
  } catch {
    return targetUrl;
  }
};

function unwrapTrackingRedirectUrl(candidate: string) {
  try {
    const parsed = new URL(candidate);
    const pathname = parsed.pathname.toLowerCase();
    const isTrackingPath = pathname === '/api/track/click' || pathname === '/api/track/automation-click';
    const encodedTarget = parsed.searchParams.get('u');
    if (!isTrackingPath || !encodedTarget) {
      return candidate;
    }

    const decodedTarget = decodeURIComponent(encodedTarget);
    const nested = new URL(decodedTarget);
    if (/^https?:$/i.test(nested.protocol)) {
      return nested.toString();
    }

    return candidate;
  } catch {
    return candidate;
  }
}

const buildAutomationClickTrackingUrl = (
  trackedTargetUrl: string | null | undefined,
  ruleKey: AutomationRuleKey,
  shopDomain: string,
  externalId?: string | null,
) => {
  if (!trackedTargetUrl) {
    return '';
  }

  const resolveTrackingBase = () => {
    const rawCandidates = [
      env.SHOPIFY_APP_URL,
      env.NEXT_PUBLIC_APP_URL,
      env.SHOPIFY_ROOT_APP_URL,
      'https://push-eagle-dashboard.vercel.app',
    ];

    const candidates: string[] = [];
    for (const raw of rawCandidates) {
      const value = String(raw ?? '').trim();
      if (!value) {
        continue;
      }
      try {
        const parsed = new URL(value);
        if (!/^https?:$/i.test(parsed.protocol)) {
          continue;
        }
        const normalized = parsed.toString().replace(/\/$/, '');
        if (!candidates.includes(normalized)) {
          candidates.push(normalized);
        }

        if (parsed.hostname === 'push-eagle.vercel.app') {
          const dashboardVariant = `${parsed.protocol}//push-eagle-dashboard.vercel.app`;
          if (!candidates.includes(dashboardVariant)) {
            candidates.push(dashboardVariant);
          }
        }
      } catch {
        // Ignore invalid tracking base candidates.
      }
    }

    const dashboardCandidate = candidates.find((item) => {
      try {
        return new URL(item).hostname.includes('dashboard');
      } catch {
        return false;
      }
    });
    if (dashboardCandidate) {
      return dashboardCandidate;
    }

    const nonLocalCandidate = candidates.find((item) => {
      try {
        return new URL(item).hostname !== 'localhost';
      } catch {
        return false;
      }
    });
    return nonLocalCandidate || candidates[0] || '';
  };

  const trackingBase = resolveTrackingBase();

  try {
    const trackerBase = new URL('/api/track/automation-click', trackingBase);
    trackerBase.searchParams.set('r', ruleKey);
    trackerBase.searchParams.set('s', shopDomain);
    trackerBase.searchParams.set('u', trackedTargetUrl);
    trackerBase.searchParams.set('nr', '1');
    if (externalId) {
      trackerBase.searchParams.set('e', externalId);
    }
    return trackerBase.toString();
  } catch {
    return '';
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

export const optimizeOversizedMediaAssets = async (shopDomain: string, limit = 5) => {
  await ensureSchema();
  const sql = getNeonSql();
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 20));

  const rows = await sql`
    SELECT id, object_key, content_type
    FROM media_assets
    WHERE shop_domain = ${shopDomain}
      AND object_key IS NOT NULL
    ORDER BY created_at DESC
    LIMIT ${safeLimit * 4}
  `;

  let optimizedCount = 0;

  for (const row of rows as Array<{ id: string; object_key: string | null; content_type: string | null }>) {
    if (optimizedCount >= safeLimit || !row.object_key) {
      continue;
    }

    try {
      const remote = await getImageFromR2(String(row.object_key));
      const result = await compressStoredImageBytes(remote.bytes, remote.contentType);
      if (!result.optimized) {
        continue;
      }

      await replaceImageInR2({
        objectKey: String(row.object_key),
        contentType: result.contentType,
        bytes: result.bytes,
        cacheControl: remote.cacheControl,
      });

      if (result.contentType !== row.content_type) {
        await sql`
          UPDATE media_assets
          SET content_type = ${result.contentType}
          WHERE id = ${String(row.id)}
            AND shop_domain = ${shopDomain}
        `;
      }

      optimizedCount += 1;
    } catch {
      // Best effort optimization only.
    }
  }

  return { optimizedCount };
};

const resolveMediaAssetByUrl = async (shopDomain: string, url: string) => {
  const sql = getNeonSql();
  const rows = await sql`
    SELECT id, object_key, public_url
    FROM media_assets
    WHERE shop_domain = ${shopDomain}
      AND (
        public_url = ${url}
        OR ${url} LIKE ('%/api/media/' || id || '%')
      )
    LIMIT 1
  `;

  return rows[0] as { id: string; object_key: string | null; public_url: string | null } | undefined;
};

export const pruneUnusedCampaignDeviceImages = async (olderThanDays = 30) => {
  await ensureSchema();
  const sql = getNeonSql();
  const safeDays = Math.max(7, Math.min(Math.floor(olderThanDays), 120));

  const rows = await sql`
    SELECT
      id,
      shop_domain,
      image_url,
      windows_image_url,
      macos_image_url,
      android_image_url
    FROM campaigns
    WHERE status = 'sent'
      AND sent_at IS NOT NULL
      AND sent_at < NOW() - (${safeDays} * INTERVAL '1 day')
      AND (
        windows_image_url IS NOT NULL
        OR macos_image_url IS NOT NULL
        OR android_image_url IS NOT NULL
      )
    ORDER BY sent_at ASC
    LIMIT 40
  `;

  let prunedCount = 0;

  for (const row of rows as Array<Record<string, unknown>>) {
    const shopDomain = String(row.shop_domain);
    const campaignId = String(row.id);
    const keeperUrl =
      pickCampaignBarImageUrl({
        imageUrl: row.image_url ? String(row.image_url) : null,
        windowsImageUrl: row.windows_image_url ? String(row.windows_image_url) : null,
        macosImageUrl: row.macos_image_url ? String(row.macos_image_url) : null,
        androidImageUrl: row.android_image_url ? String(row.android_image_url) : null,
      }) ?? (row.image_url ? String(row.image_url) : null);

    const deviceUrls = [
      row.windows_image_url ? String(row.windows_image_url) : null,
      row.macos_image_url ? String(row.macos_image_url) : null,
      row.android_image_url ? String(row.android_image_url) : null,
    ].filter((url): url is string => Boolean(url));

    const unusedUrls = deviceUrls.filter((url) => url !== keeperUrl);
    if (unusedUrls.length === 0) {
      continue;
    }

    for (const url of unusedUrls) {
      const asset = await resolveMediaAssetByUrl(shopDomain, url);
      if (asset?.object_key) {
        try {
          await deleteImageFromR2(String(asset.object_key));
        } catch {
          // Best effort remote delete.
        }
      }

      if (asset?.id) {
        await sql`
          DELETE FROM media_assets
          WHERE id = ${String(asset.id)}
            AND shop_domain = ${shopDomain}
        `;
      }

      prunedCount += 1;
    }

    await sql`
      UPDATE campaigns
      SET
        image_url = COALESCE(${keeperUrl}, image_url),
        windows_image_url = ${unusedUrls.includes(String(row.windows_image_url ?? '')) ? null : row.windows_image_url},
        macos_image_url = ${unusedUrls.includes(String(row.macos_image_url ?? '')) ? null : row.macos_image_url},
        android_image_url = ${unusedUrls.includes(String(row.android_image_url ?? '')) ? null : row.android_image_url}
      WHERE id = ${campaignId}
        AND shop_domain = ${shopDomain}
    `;
  }

  return { prunedCount };
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

  const targetUrl = toHttpUrlOrNull(unwrapTrackingRedirectUrl(payload.targetUrl ?? ''), storeBase) ?? storeBase;

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
      const link = toHttpUrlOrNull(unwrapTrackingRedirectUrl(String(button.link ?? '')), storeBase);
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
  { key: 'welcome_subscriber', enabled: false, config: parseWelcomeRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'browse_abandonment_15m', enabled: false, config: parseBrowseRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'cart_abandonment_30m', enabled: false, config: parseCartRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'checkout_abandonment_30m', enabled: false, config: { delayMinutes: 30 } },
  { key: 'shipping_notifications', enabled: false, config: parseShippingRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'back_in_stock', enabled: false, config: parseBackInStockRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'price_drop', enabled: false, config: parsePriceDropRuleConfig(null) as unknown as Record<string, unknown> },
  { key: 'win_back_7d', enabled: false, config: { delayDays: 7 } },
  { key: 'post_purchase_followup', enabled: false, config: { delayDays: 2 } },
];

const automationRulesReadyAt = new Map<string, number>();
const AUTOMATION_RULES_READY_TTL_MS = 5 * 60 * 1000;

const ensureAutomationRules = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const readyAt = automationRulesReadyAt.get(shop);
  if (readyAt && Date.now() - readyAt < AUTOMATION_RULES_READY_TTL_MS) {
    return;
  }

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

  if (COMING_SOON_AUTOMATIONS_ENABLED) {
    for (const ruleKey of COMING_SOON_AUTOMATION_RULE_KEYS) {
      await sql`
        UPDATE automation_rules
        SET enabled = false,
            updated_at = NOW()
        WHERE shop_domain = ${shopDomain}
          AND rule_key = ${ruleKey}
      `;
    }
  }

  automationRulesReadyAt.set(shop, Date.now());
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
    enabled: isComingSoonAutomation(String(row.rule_key)) ? false : Boolean(row.enabled),
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
  const requestedEnabled = typeof enabled === 'boolean' ? enabled : currentEnabled;
  const nextEnabled = isComingSoonAutomation(ruleKey) ? false : requestedEnabled;
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

  // Raw-event collection is gated on whether the consuming automation is on, and
  // that decision is cached (in-process + KV). Drop the cache immediately so the
  // webhook/storefront gates react to this toggle without waiting for TTL expiry.
  if (currentEnabled !== nextEnabled) {
    const { invalidateCollectionFlags } = await import('@/lib/server/automation/collection-gate');
    void invalidateCollectionFlags(shopDomain);
  }

  if (!nextEnabled) {
    await sql`
      UPDATE automation_jobs
      SET status = 'skipped',
          error_message = 'Automation rule is disabled.',
          updated_at = NOW()
      WHERE shop_domain = ${shopDomain}
        AND rule_key = ${ruleKey}
        AND status = 'pending'
    `;
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
  const { getAutomationStatsByRule } = await import('@/lib/server/integrations/deliveries-data');

  const [rules, { deliveries: deliveryStats, clicks: clickStats }, archivedStats] = await Promise.all([
    listAutomationRules(shopDomain),
    getAutomationStatsByRule(shopDomain),
    // Lifetime totals of already-pruned rows (see automation_rule_stats). Adding
    // these to the live detail sums keeps all-time per-rule stats permanent even
    // after the raw rows are pruned. Zero before any pruning has happened, so this
    // never changes displayed numbers at rollout.
    sql`
      SELECT rule_key, archived_impressions, archived_clicks, archived_revenue_cents
      FROM automation_rule_stats
      WHERE shop_domain = ${shopDomain}
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
  const archivedByRule = new Map(
    archivedStats.map((row) => [String(row.rule_key), {
      impressions: Number(row.archived_impressions ?? 0),
      clicks: Number(row.archived_clicks ?? 0),
      revenueCents: Number(row.archived_revenue_cents ?? 0),
    }]),
  );

  const summaries = rules.map((rule) => {
    const delivery = deliveriesByRule.get(rule.ruleKey) ?? { impressions: 0, revenueCents: 0 };
    const click = clicksByRule.get(rule.ruleKey) ?? { clicks: 0, revenueCents: 0 };
    const archived = archivedByRule.get(rule.ruleKey) ?? { impressions: 0, clicks: 0, revenueCents: 0 };
    return {
      ...rule,
      impressions: delivery.impressions + archived.impressions,
      clicks: click.clicks + archived.clicks,
      revenueCents: delivery.revenueCents + click.revenueCents + archived.revenueCents,
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

export const getAutomationStats = async (
  shopDomain: string,
  from?: Date | null,
  to?: Date | null,
) => {
  await ensureAutomationRules(shopDomain);
  const sql = getNeonSql();
  const hasRange = Boolean(from && to);
  const { getAutomationStatsByRule } = await import('@/lib/server/integrations/deliveries-data');

  const [rules, { deliveries: deliveryStats, clicks: clickStats }, archivedStats] = await Promise.all([
    listAutomationRules(shopDomain),
    getAutomationStatsByRule(shopDomain, from, to),
    // Only all-time (no date range) folds in the archived baseline of pruned rows.
    // A bounded date range is served purely from the retained detail (retention
    // must stay >= the largest selectable range, currently 90d <= 120d), so adding
    // the (non-date-bucketed) archived totals there would over-count.
    hasRange
      ? Promise.resolve([] as Array<Record<string, unknown>>)
      : sql`
          SELECT rule_key, archived_impressions, archived_clicks, archived_revenue_cents
          FROM automation_rule_stats
          WHERE shop_domain = ${shopDomain}
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
  const archivedByRule = new Map(
    archivedStats.map((row) => [String(row.rule_key), {
      impressions: Number(row.archived_impressions ?? 0),
      clicks: Number(row.archived_clicks ?? 0),
      revenueCents: Number(row.archived_revenue_cents ?? 0),
    }]),
  );

  const summaries = rules.map((rule) => {
    const delivery = deliveriesByRule.get(rule.ruleKey) ?? { impressions: 0, revenueCents: 0 };
    const click = clicksByRule.get(rule.ruleKey) ?? { clicks: 0, revenueCents: 0 };
    const archived = archivedByRule.get(rule.ruleKey) ?? { impressions: 0, clicks: 0, revenueCents: 0 };
    return {
      ...rule,
      impressions: delivery.impressions + archived.impressions,
      clicks: click.clicks + archived.clicks,
      revenueCents: delivery.revenueCents + click.revenueCents + archived.revenueCents,
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
    enabled: isComingSoonAutomation(ruleKey) ? false : Boolean(rows[0]?.enabled),
    config: (rows[0]?.config ?? {}) as Record<string, unknown>,
  };
};

const listAutomationTargets = async (input: { shopDomain: string; externalId?: string | null; subscriberId?: number | null }) => {
  const sql = getNeonSql();

  if (!input.externalId && !input.subscriberId) {
    return [] as Array<{ tokenId: number; subscriberId: number | null; externalId: string | null }>;
  }

  const { audienceRead, d1AutomationTargetsBySubscriberId, d1AutomationTargetsByExternalId } =
    await import('@/lib/server/integrations/d1-audience');
  type Target = { tokenId: number; subscriberId: number | null; externalId: string | null };
  const key = (rows: Target[]) => rows.map((r) => r.tokenId).sort((a, b) => a - b).join(',');

  // Keep only the most recently seen active token per subscriber to prevent duplicate sends.
  return audienceRead<Target[]>({
    label: input.subscriberId ? 'automation.targets.bySubscriberId' : 'automation.targets.byExternalId',
    key,
    neon: async () => {
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
              AND (
                COALESCE(t.token_type, 'fcm') <> 'vapid'
                OR (
                  COALESCE(t.vapid_endpoint, '') <> ''
                  AND COALESCE(t.vapid_p256dh, '') <> ''
                  AND COALESCE(t.vapid_auth, '') <> ''
                )
              )
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
                PARTITION BY s.external_id
                ORDER BY t.last_seen_at DESC NULLS LAST, t.updated_at DESC, t.id DESC
              ) AS rn
            FROM subscriber_tokens t
            JOIN subscribers s ON s.id = t.subscriber_id
            WHERE t.shop_domain = ${input.shopDomain}
              AND s.external_id = ${input.externalId ?? ''}
              AND t.status = 'active'
              AND (
                COALESCE(t.token_type, 'fcm') <> 'vapid'
                OR (
                  COALESCE(t.vapid_endpoint, '') <> ''
                  AND COALESCE(t.vapid_p256dh, '') <> ''
                  AND COALESCE(t.vapid_auth, '') <> ''
                )
              )
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
    },
    d1: async () =>
      input.subscriberId
        ? d1AutomationTargetsBySubscriberId(input.shopDomain, input.subscriberId)
        : d1AutomationTargetsByExternalId(input.shopDomain, input.externalId ?? ''),
  });
};

const listAutomationTargetsByExternalIds = async (shopDomain: string, externalIds: string[]) => {
  if (externalIds.length === 0) {
    return [] as Array<{ tokenId: number; subscriberId: number | null; externalId: string | null }>;
  }

  const sql = getNeonSql();
  const { audienceRead, d1AutomationTargetsByExternalIds } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  type Target = { tokenId: number; subscriberId: number | null; externalId: string | null };

  return audienceRead<Target[]>({
    label: 'automation.targets.byExternalIds',
    key: (rows) => rows.map((r) => r.tokenId).sort((a, b) => a - b).join(','),
    neon: async () => {
      const rows = await sql`
        WITH ranked AS (
          SELECT
            t.id AS token_id,
            s.id AS subscriber_id,
            s.external_id,
            ROW_NUMBER() OVER (
              PARTITION BY s.external_id
              ORDER BY t.last_seen_at DESC NULLS LAST, t.updated_at DESC, t.id DESC
            ) AS rn
          FROM subscriber_tokens t
          JOIN subscribers s ON s.id = t.subscriber_id
          WHERE t.shop_domain = ${shopDomain}
            AND s.external_id = ANY(${externalIds})
            AND t.status = 'active'
            AND (
              COALESCE(t.token_type, 'fcm') <> 'vapid'
              OR (
                COALESCE(t.vapid_endpoint, '') <> ''
                AND COALESCE(t.vapid_p256dh, '') <> ''
                AND COALESCE(t.vapid_auth, '') <> ''
              )
            )
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
    },
    d1: async () => d1AutomationTargetsByExternalIds(shopDomain, externalIds),
  });
};

const listAutomationTargetsByClientId = async (shopDomain: string, clientId: string) => {
  const normalizedClientId = String(clientId || '').trim();
  if (!normalizedClientId) {
    return [] as Array<{ tokenId: number; subscriberId: number | null; externalId: string | null }>;
  }

  const sql = getNeonSql();
  const { audienceRead, d1AutomationTargetsByClientId } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  type Target = { tokenId: number; subscriberId: number | null; externalId: string | null };

  return audienceRead<Target[]>({
    label: 'automation.targets.byClientId',
    key: (rows) => rows.map((r) => r.tokenId).sort((a, b) => a - b).join(','),
    neon: async () => {
      const rows = await sql`
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
          WHERE t.shop_domain = ${shopDomain}
            AND s.shop_domain = ${shopDomain}
            AND t.status = 'active'
            AND (
              COALESCE(t.token_type, 'fcm') <> 'vapid'
              OR (
                COALESCE(t.vapid_endpoint, '') <> ''
                AND COALESCE(t.vapid_p256dh, '') <> ''
                AND COALESCE(t.vapid_auth, '') <> ''
              )
            )
            AND (
              COALESCE(s.device_context ->> 'clientId', '') = ${normalizedClientId}
              OR COALESCE(s.device_context ->> 'shopifyAnalyticsClientId', '') = ${normalizedClientId}
            )
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
    },
    d1: async () => d1AutomationTargetsByClientId(shopDomain, normalizedClientId),
  });
};

const normalizeClientId = (metadata?: Record<string, unknown> | null) => {
  const raw = metadata && typeof metadata.clientId === 'string'
    ? metadata.clientId
    : metadata && typeof metadata.shopifyAnalyticsClientId === 'string'
      ? metadata.shopifyAnalyticsClientId
      : '';
  const value = raw.trim();
  return value.length > 0 ? value : null;
};

const externalIdPriority = (externalId: string) => {
  if (externalId.startsWith('anon:')) return 0;
  if (externalId.startsWith('shopify_customer:')) return 1;
  if (externalId.startsWith('email:')) return 2;
  if (externalId.startsWith('cart:')) return 3;
  if (externalId.startsWith('px:')) return 4;
  return 5;
};

const buildExternalIdAliases = (input: {
  shopDomain: string;
  externalId?: string | null;
  cartToken?: string | null;
  clientId?: string | null;
}) => {
  const aliases = new Set<string>();

  const addAlias = (value?: string | null) => {
    const normalized = value == null ? '' : String(value).trim();
    if (normalized) {
      aliases.add(normalized);
    }
  };

  const normalizedShopDomain = String(input.shopDomain || '').trim().toLowerCase();
  const normalizedExternalId = input.externalId?.trim() || null;
  const normalizedCartToken = input.cartToken?.trim() || null;
  const normalizedClientId = input.clientId?.trim() || null;

  addAlias(normalizedExternalId);

  if (normalizedCartToken) {
    addAlias(normalizedCartToken);
    addAlias(`cart:${normalizedCartToken}`);
    if (normalizedShopDomain) {
      addAlias(`cart:${normalizedShopDomain}:${normalizedCartToken}`);
    }
  }

  if (normalizedClientId) {
    addAlias(normalizedClientId);
    addAlias(`px:${normalizedClientId}`);
    if (normalizedShopDomain) {
      addAlias(`px:${normalizedShopDomain}:${normalizedClientId}`);
    }
  }

  if (normalizedExternalId) {
    const cartPrefix = normalizedShopDomain ? `cart:${normalizedShopDomain}:` : 'cart:';
    if (normalizedExternalId.startsWith(cartPrefix)) {
      const extractedCartToken = normalizedExternalId.slice(cartPrefix.length).trim();
      if (extractedCartToken) {
        addAlias(extractedCartToken);
        addAlias(`cart:${extractedCartToken}`);
      }
    }

    const pxPrefix = normalizedShopDomain ? `px:${normalizedShopDomain}:` : 'px:';
    if (normalizedExternalId.startsWith(pxPrefix)) {
      const extractedClientId = normalizedExternalId.slice(pxPrefix.length).trim();
      if (extractedClientId) {
        addAlias(extractedClientId);
        addAlias(`px:${extractedClientId}`);
      }
    }
  }

  return Array.from(aliases);
};

const resolveAutomationExternalIds = async (input: {
  shopDomain: string;
  externalId?: string | null;
  cartToken?: string | null;
  clientId?: string | null;
}) => {
  const externalIdAliases = buildExternalIdAliases(input);
  const normalizedExternalId = input.externalId?.trim() || null;
  const normalizedCartToken = input.cartToken?.trim() || null;
  const normalizedClientId = input.clientId?.trim() || null;

  const sql = getNeonSql();
  const windowStart = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const windowStartIso = windowStart.toISOString();

  const { isD1EventsEnabled, queryD1TrackingRowsForAutomation } = await import('@/lib/server/integrations/d1-events');
  if (isD1EventsEnabled()) {
    const d1Rows = await queryD1TrackingRowsForAutomation({
      shopDomain: input.shopDomain,
      cartToken: normalizedCartToken,
      clientId: normalizedClientId,
      windowStartIso,
    });

    const cartRows = d1Rows;
    const cartRelatedClientIds = Array.from(
      new Set(
        cartRows
          .map((row) => (row.client_id ? String(row.client_id).trim() : ''))
          .filter((value) => value.length > 0),
      ),
    );

    const fallbackClientIds = Array.from(
      new Set(
        [normalizedClientId, ...cartRelatedClientIds].filter((value): value is string => Boolean(value)),
      ),
    );

    const externalIdsFromTracking = Array.from(
      new Set(
        cartRows
          .map((row) => String(row.external_id ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    );

    const {
      audienceRead: audReadAlias,
      d1FilterExternalIdsWithActiveToken,
      d1ExternalIdsByClientIds,
    } = await import('@/lib/server/integrations/d1-audience');
    const sortedExternalIdKey = (rows: Array<{ external_id: string }>) =>
      rows.map((r) => r.external_id).sort().join(',');

    const aliasRows = externalIdAliases.length > 0
      ? await audReadAlias<Array<{ external_id: string }>>({
          label: 'resolveAutomationExternalIds.alias.d1events',
          key: sortedExternalIdKey,
          neon: async () =>
            (
              await sql`
                SELECT DISTINCT s.external_id
                FROM subscribers s
                JOIN subscriber_tokens t ON t.subscriber_id = s.id
                WHERE s.shop_domain = ${input.shopDomain}
                  AND s.external_id = ANY(${externalIdAliases})
                  AND t.shop_domain = ${input.shopDomain}
                  AND t.status = 'active'
                LIMIT 100
              `
            ).map((row) => ({ external_id: String(row.external_id) })),
          d1: async () =>
            (await d1FilterExternalIdsWithActiveToken(input.shopDomain, externalIdAliases)).map(
              (external_id) => ({ external_id }),
            ),
        })
      : [];

    const clientIdSubscriberFallback =
      fallbackClientIds.length > 0 && aliasRows.length === 0
        ? await audReadAlias<Array<{ external_id: string }>>({
            label: 'resolveAutomationExternalIds.clientIdFallback.d1events',
            key: sortedExternalIdKey,
            neon: async () =>
              (
                await sql`
                  SELECT DISTINCT s.external_id
                  FROM subscribers s
                  JOIN subscriber_tokens t ON t.subscriber_id = s.id
                  WHERE s.shop_domain = ${input.shopDomain}
                    AND t.shop_domain = ${input.shopDomain}
                    AND t.status = 'active'
                    AND (
                      COALESCE(s.device_context ->> 'clientId', '') = ANY(${fallbackClientIds})
                      OR COALESCE(s.device_context ->> 'shopifyAnalyticsClientId', '') = ANY(${fallbackClientIds})
                    )
                  LIMIT 100
                `
              ).map((row) => ({ external_id: String(row.external_id) })),
            d1: async () =>
              (await d1ExternalIdsByClientIds(input.shopDomain, fallbackClientIds)).map(
                (external_id) => ({ external_id }),
              ),
          })
        : [];

    const resolvedExternalIds = Array.from(
      new Set([
        ...externalIdsFromTracking,
        ...externalIdAliases,
        ...aliasRows.map((row) => String(row.external_id)),
        ...clientIdSubscriberFallback.map((row) => String(row.external_id)),
        ...(normalizedExternalId ? [normalizedExternalId] : []),
      ].filter(Boolean)),
    );

    return resolvedExternalIds;
  }

  const cartRows = normalizedCartToken
    ? await sql`
      WITH cart_related AS (
        SELECT
          external_id,
          created_at,
          COALESCE(metadata ->> 'clientId', metadata ->> 'shopifyAnalyticsClientId', '') AS client_id
        FROM subscriber_activity_events
        WHERE shop_domain = ${input.shopDomain}
          AND cart_token = ${normalizedCartToken}
          AND created_at >= ${windowStart}

        UNION ALL

        SELECT
          external_id,
          created_at,
          COALESCE(client_id, '') AS client_id
        FROM pixel_events
        WHERE shop_domain = ${input.shopDomain}
          AND cart_token = ${normalizedCartToken}
          AND created_at >= ${windowStart}
      ),
      stitched AS (
        SELECT external_id, created_at, client_id
        FROM cart_related

        UNION ALL

        SELECT
          e.external_id,
          e.created_at,
          COALESCE(e.metadata ->> 'clientId', e.metadata ->> 'shopifyAnalyticsClientId', '') AS client_id
        FROM subscriber_activity_events e
        WHERE e.shop_domain = ${input.shopDomain}
          AND e.created_at >= ${windowStart}
          AND COALESCE(e.metadata ->> 'clientId', e.metadata ->> 'shopifyAnalyticsClientId', '') = ANY(
            ARRAY(SELECT DISTINCT client_id FROM cart_related WHERE client_id <> '')
          )

        UNION ALL

        SELECT
          p.external_id,
          p.created_at,
          COALESCE(p.client_id, '') AS client_id
        FROM pixel_events p
        WHERE p.shop_domain = ${input.shopDomain}
          AND p.created_at >= ${windowStart}
          AND COALESCE(p.client_id, '') = ANY(
            ARRAY(SELECT DISTINCT client_id FROM cart_related WHERE client_id <> '')
          )
      )
      SELECT external_id, created_at, client_id
      FROM stitched
      WHERE external_id IS NOT NULL
        AND external_id <> ''
      ORDER BY created_at DESC
      LIMIT 100
    `
    : [];

  const cartRelatedClientIds = Array.from(
    new Set(
      cartRows
        .map((row) => (row.client_id ? String(row.client_id).trim() : ''))
        .filter((value) => value.length > 0),
    ),
  );

  const fallbackClientIds = Array.from(
    new Set(
      [normalizedClientId, ...cartRelatedClientIds].filter((value): value is string => Boolean(value)),
    ),
  );

  const clientRows = normalizedClientId
    ? await sql`
      SELECT external_id, created_at
      FROM (
        SELECT external_id, created_at
        FROM subscriber_activity_events
        WHERE shop_domain = ${input.shopDomain}
          AND COALESCE(metadata ->> 'clientId', metadata ->> 'shopifyAnalyticsClientId', '') = ${normalizedClientId}
          AND created_at >= ${windowStart}

        UNION ALL

        SELECT external_id, created_at
        FROM pixel_events
        WHERE shop_domain = ${input.shopDomain}
          AND COALESCE(client_id, '') = ${normalizedClientId}
          AND created_at >= ${windowStart}
      ) stitched
      WHERE external_id IS NOT NULL
        AND external_id <> ''
      ORDER BY created_at DESC
      LIMIT 100
    `
    : [];

  const {
    audienceRead: audReadAlias2,
    d1FilterExternalIdsWithActiveToken: d1FilterAlias2,
    d1ExternalIdsByClientIds: d1ByClientIds2,
  } = await import('@/lib/server/integrations/d1-audience');
  const sortedExternalIdKey2 = (rows: Array<{ external_id: string }>) =>
    rows.map((r) => r.external_id).sort().join(',');

  const aliasRows = externalIdAliases.length > 0
    ? await audReadAlias2<Array<{ external_id: string }>>({
        label: 'resolveAutomationExternalIds.alias.neon',
        key: sortedExternalIdKey2,
        neon: async () =>
          (
            await sql`
              SELECT DISTINCT s.external_id
              FROM subscribers s
              JOIN subscriber_tokens t ON t.subscriber_id = s.id
              WHERE s.shop_domain = ${input.shopDomain}
                AND s.external_id = ANY(${externalIdAliases})
                AND t.shop_domain = ${input.shopDomain}
                AND t.status = 'active'
              LIMIT 100
            `
          ).map((row) => ({ external_id: String(row.external_id) })),
        d1: async () =>
          (await d1FilterAlias2(input.shopDomain, externalIdAliases)).map((external_id) => ({
            external_id,
          })),
      })
    : [];

  // Fallback: if we have a clientId, find subscribers who share that clientId via device context.
  // This provides a reliable identity link when pixel events come before cart registration.
  const clientIdSubscriberFallback =
    fallbackClientIds.length > 0 && aliasRows.length === 0
      ? await audReadAlias2<Array<{ external_id: string }>>({
          label: 'resolveAutomationExternalIds.clientIdFallback.neon',
          key: sortedExternalIdKey2,
          neon: async () =>
            (
              await sql`
                SELECT DISTINCT s.external_id
                FROM subscribers s
                JOIN subscriber_tokens t ON t.subscriber_id = s.id
                WHERE s.shop_domain = ${input.shopDomain}
                  AND t.shop_domain = ${input.shopDomain}
                  AND t.status = 'active'
                  AND (
                    COALESCE(s.device_context ->> 'clientId', '') = ANY(${fallbackClientIds})
                    OR COALESCE(s.device_context ->> 'shopifyAnalyticsClientId', '') = ANY(${fallbackClientIds})
                    OR EXISTS (
                      SELECT 1 FROM pixel_events
                      WHERE pixel_events.shop_domain = ${input.shopDomain}
                        AND COALESCE(pixel_events.client_id, '') = ANY(${fallbackClientIds})
                        AND COALESCE(pixel_events.external_id, '') = s.external_id
                        LIMIT 1
                    )
                  )
                ORDER BY t.last_seen_at DESC NULLS LAST, s.last_seen_at DESC NULLS LAST
                LIMIT 50
              `
            ).map((row) => ({ external_id: String(row.external_id) })),
          d1: async () => {
            // device_context match lives in D1; the pixel_events identity link lives
            // in Neon, so pull candidate external_ids from Neon then keep only those
            // that still have an active token in D1.
            const direct = await d1ByClientIds2(input.shopDomain, fallbackClientIds);
            const pxRows = await sql`
              SELECT DISTINCT external_id
              FROM pixel_events
              WHERE shop_domain = ${input.shopDomain}
                AND COALESCE(client_id, '') = ANY(${fallbackClientIds})
                AND COALESCE(external_id, '') <> ''
              LIMIT 200
            `;
            const pxExternalIds = pxRows
              .map((row) => String(row.external_id ?? ''))
              .filter(Boolean);
            const pxWithToken = await d1FilterAlias2(input.shopDomain, pxExternalIds);
            return Array.from(new Set([...direct, ...pxWithToken])).map((external_id) => ({
              external_id,
            }));
          },
        })
      : [];

  const candidates = Array.from(
    new Set(
      [
        ...externalIdAliases,
        normalizedExternalId,
        ...aliasRows.map((row) => (row.external_id ? String(row.external_id) : null)),
        ...cartRows.map((row) => (row.external_id ? String(row.external_id) : null)),
        ...clientRows.map((row) => (row.external_id ? String(row.external_id) : null)),
        ...clientIdSubscriberFallback.map((row) => (row.external_id ? String(row.external_id) : null)),
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  return candidates.sort((a, b) => {
    const priorityDelta = externalIdPriority(a) - externalIdPriority(b);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return a.localeCompare(b);
  });
};

const enqueueAutomationForTargets = async (input: {
  shopDomain: string;
  ruleKey: AutomationRuleKey;
  targets: Array<{ tokenId: number; subscriberId: number | null; externalId?: string | null }>;
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
        externalId: target.externalId ?? input.payload.externalId ?? null,
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

  const sinceIso = new Date(input.since).toISOString();
  const { isD1EventsEnabled, hasD1RecentSubscriberActivity } = await import('@/lib/server/integrations/d1-events');
  if (isD1EventsEnabled()) {
    const d1Hit = await hasD1RecentSubscriberActivity({
      shopDomain: input.shopDomain,
      externalId: input.externalId,
      sinceIso,
      eventTypes: input.eventTypes,
      productId: input.productId,
      cartToken: input.cartToken,
    }).catch(() => false);
    if (d1Hit) {
      return true;
    }
  }

  const sql = getNeonSql();

  let identityFilter = sql``;
  if (input.productId) {
    identityFilter = sql`AND product_id = ${input.productId}`;
  } else if (input.cartToken) {
    identityFilter = sql`AND cart_token = ${input.cartToken}`;
  }

  const rows = await sql`
    SELECT id
    FROM subscriber_activity_events
    WHERE shop_domain = ${input.shopDomain}
      AND external_id = ${input.externalId}
      AND event_type = ANY(${input.eventTypes})
      AND created_at > ${new Date(input.since)}
      ${identityFilter}
    LIMIT 1
  `;

  return rows.length > 0;
};

const hasCheckoutCompleteSince = async (input: {
  shopDomain: string;
  externalId?: string | null;
  cartToken?: string | null;
  since?: Date | null;
}) => {
  const payloadExternalId = input.externalId?.trim() || null;
  const payloadCartToken = input.cartToken?.trim() || null;
  if (!payloadExternalId && !payloadCartToken) {
    return false;
  }

  const sinceIso = input.since ? input.since.toISOString() : null;
  const { isD1EventsEnabled, hasD1CheckoutCompleteSince } = await import('@/lib/server/integrations/d1-events');
  if (isD1EventsEnabled()) {
    const d1Hit = await hasD1CheckoutCompleteSince({
      shopDomain: input.shopDomain,
      externalId: payloadExternalId,
      cartToken: payloadCartToken,
      sinceIso,
    }).catch(() => false);
    if (d1Hit) {
      return true;
    }
  }

  const sql = getNeonSql();
  const payloadTriggeredAt = input.since ?? null;

  const checkoutCompletedRows = payloadExternalId && payloadCartToken
    ? await sql`
      SELECT id
      FROM subscriber_activity_events
      WHERE shop_domain = ${input.shopDomain}
        AND event_type = 'checkout_complete'
        AND (external_id = ${payloadExternalId} OR cart_token = ${payloadCartToken})
        ${payloadTriggeredAt ? sql`AND created_at >= ${payloadTriggeredAt}` : sql``}
      ORDER BY created_at DESC
      LIMIT 1
    `
    : payloadExternalId
      ? await sql`
        SELECT id
        FROM subscriber_activity_events
        WHERE shop_domain = ${input.shopDomain}
          AND event_type = 'checkout_complete'
          AND external_id = ${payloadExternalId}
          ${payloadTriggeredAt ? sql`AND created_at >= ${payloadTriggeredAt}` : sql``}
        ORDER BY created_at DESC
        LIMIT 1
      `
      : payloadCartToken
        ? await sql`
          SELECT id
          FROM subscriber_activity_events
          WHERE shop_domain = ${input.shopDomain}
            AND event_type = 'checkout_complete'
            AND cart_token = ${payloadCartToken}
            ${payloadTriggeredAt ? sql`AND created_at >= ${payloadTriggeredAt}` : sql``}
          ORDER BY created_at DESC
          LIMIT 1
        `
        : [];

  return Boolean(checkoutCompletedRows[0]?.id);
};

const cancelPendingCartReminderJobs = async (input: {
  shopDomain: string;
  externalId?: string | null;
  cartToken?: string | null;
}) => {
  const externalId = input.externalId?.trim() || null;
  const cartToken = input.cartToken?.trim() || null;
  if (!externalId && !cartToken) {
    return;
  }

  const sql = getNeonSql();
  if (externalId && cartToken) {
    await sql`
      UPDATE automation_jobs
      SET status = 'skipped',
          error_message = 'Cart recovered before reminder send.',
          updated_at = NOW(),
          queue_enqueued_at = NULL
      WHERE shop_domain = ${input.shopDomain}
        AND rule_key = 'cart_abandonment_30m'
        AND status = 'pending'
        AND (
          payload ->> 'externalId' = ${externalId}
          OR payload ->> 'cartToken' = ${cartToken}
        )
    `;
    return;
  }

  if (externalId) {
    await sql`
      UPDATE automation_jobs
      SET status = 'skipped',
          error_message = 'Cart recovered before reminder send.',
          updated_at = NOW(),
          queue_enqueued_at = NULL
      WHERE shop_domain = ${input.shopDomain}
        AND rule_key = 'cart_abandonment_30m'
        AND status = 'pending'
        AND payload ->> 'externalId' = ${externalId}
    `;
    return;
  }

  await sql`
    UPDATE automation_jobs
    SET status = 'skipped',
        error_message = 'Cart recovered before reminder send.',
        updated_at = NOW(),
        queue_enqueued_at = NULL
    WHERE shop_domain = ${input.shopDomain}
      AND rule_key = 'cart_abandonment_30m'
      AND status = 'pending'
      AND payload ->> 'cartToken' = ${cartToken}
  `;
};

const hasRecentOrder = async (input: {
  shopDomain: string;
  externalId?: string | null;
  customerId?: string | null;
  since?: string | null;
}) => {
  const externalId = input.externalId?.trim() || null;
  const customerId = input.customerId?.trim() || null;

  if (!input.since || (!externalId && !customerId)) {
    return false;
  }

  const { isD1CommerceEnabled, d1HasRecentOrder } = await import(
    '@/lib/server/integrations/d1-commerce'
  );
  if (isD1CommerceEnabled()) {
    return d1HasRecentOrder({
      shopDomain: input.shopDomain,
      externalId,
      customerId,
      since: input.since,
    });
  }

  const sql = getNeonSql();
  const since = new Date(input.since);

  const rows = externalId && customerId
    ? await sql`
      SELECT id
      FROM shopify_orders
      WHERE shop_domain = ${input.shopDomain}
        AND created_at > ${since}
        AND (external_id = ${externalId} OR customer_id = ${customerId})
      LIMIT 1
    `
    : externalId
      ? await sql`
        SELECT id
        FROM shopify_orders
        WHERE shop_domain = ${input.shopDomain}
          AND created_at > ${since}
          AND external_id = ${externalId}
        LIMIT 1
      `
      : await sql`
        SELECT id
        FROM shopify_orders
        WHERE shop_domain = ${input.shopDomain}
          AND created_at > ${since}
          AND customer_id = ${customerId}
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
  const { neonTableExists } = await import('@/lib/server/integrations/neon-legacy-tables');

  const now = Date.now();
  const webhookCutoff = new Date(now - readRetentionDays('PE_RETENTION_WEBHOOK_EVENT_DAYS', 5) * DAY_MS);
  const activityCutoff = new Date(now - readRetentionDays('PE_RETENTION_ACTIVITY_DAYS', 45) * DAY_MS);
  const jobCutoff = new Date(now - readRetentionDays('PE_RETENTION_AUTOMATION_JOB_DAYS', 14) * DAY_MS);

  if (await neonTableExists('webhook_events')) {
    await sql`
      DELETE FROM webhook_events
      WHERE received_at < ${webhookCutoff}
    `;
  }

  if (await neonTableExists('subscriber_activity_events')) {
    await sql`
      DELETE FROM subscriber_activity_events
      WHERE created_at < ${activityCutoff}
    `;
  }

  await sql`
    DELETE FROM automation_jobs
    WHERE status IN ('sent', 'failed', 'skipped')
      AND updated_at < ${jobCutoff}
  `;
};

export const rollupMerchantDailyStats = async () => {
  await ensureSchema();
  const sql = getNeonSql();
  const { neonTableExists } = await import('@/lib/server/integrations/neon-legacy-tables');
  const automationTablesOnNeon =
    (await neonTableExists('automation_deliveries')) &&
    (await neonTableExists('automation_clicks'));

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const statDate = yesterday.toISOString().slice(0, 10);
  const dayStart = new Date(`${statDate}T00:00:00.000Z`);
  const dayEnd = new Date(`${statDate}T23:59:59.999Z`);

  const rows = automationTablesOnNeon
    ? await sql`
    INSERT INTO merchant_daily_stats (
      shop_domain,
      stat_date,
      campaign_impressions,
      campaign_clicks,
      campaign_revenue_cents,
      automation_impressions,
      automation_clicks,
      automation_revenue_cents,
      new_subscribers,
      updated_at
    )
    SELECT
      m.shop_domain,
      ${statDate}::date,
      COALESCE(campaign_stats.impressions, 0)::BIGINT,
      COALESCE(campaign_stats.clicks, 0)::BIGINT,
      COALESCE(campaign_stats.revenue_cents, 0)::BIGINT,
      COALESCE(auto_stats.impressions, 0)::BIGINT,
      COALESCE(auto_click_stats.clicks, 0)::BIGINT,
      (
        COALESCE(auto_stats.revenue_cents, 0) + COALESCE(auto_click_stats.revenue_cents, 0)
      )::BIGINT,
      COALESCE(subscriber_stats.new_subscribers, 0)::BIGINT,
      NOW()
    FROM merchants m
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(delivery_count), 0) AS impressions,
        COALESCE(SUM(click_count), 0) AS clicks,
        COALESCE(SUM(revenue_cents), 0) AS revenue_cents
      FROM campaigns
      WHERE shop_domain = m.shop_domain
        AND created_at >= ${dayStart}
        AND created_at <= ${dayEnd}
    ) campaign_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS impressions,
        COALESCE(SUM(revenue_cents), 0) AS revenue_cents
      FROM automation_deliveries
      WHERE shop_domain = m.shop_domain
        AND delivered_at >= ${dayStart}
        AND delivered_at <= ${dayEnd}
    ) auto_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS clicks,
        COALESCE(SUM(revenue_cents), 0) AS revenue_cents
      FROM automation_clicks
      WHERE shop_domain = m.shop_domain
        AND clicked_at >= ${dayStart}
        AND clicked_at <= ${dayEnd}
    ) auto_click_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS new_subscribers
      FROM subscribers
      WHERE shop_domain = m.shop_domain
        AND created_at >= ${dayStart}
        AND created_at <= ${dayEnd}
    ) subscriber_stats ON TRUE
    WHERE m.uninstalled_at IS NULL
    ON CONFLICT (shop_domain, stat_date) DO UPDATE SET
      campaign_impressions = EXCLUDED.campaign_impressions,
      campaign_clicks = EXCLUDED.campaign_clicks,
      campaign_revenue_cents = EXCLUDED.campaign_revenue_cents,
      automation_impressions = EXCLUDED.automation_impressions,
      automation_clicks = EXCLUDED.automation_clicks,
      automation_revenue_cents = EXCLUDED.automation_revenue_cents,
      new_subscribers = EXCLUDED.new_subscribers,
      updated_at = NOW()
    RETURNING shop_domain
  `
    : await sql`
    INSERT INTO merchant_daily_stats (
      shop_domain,
      stat_date,
      campaign_impressions,
      campaign_clicks,
      campaign_revenue_cents,
      automation_impressions,
      automation_clicks,
      automation_revenue_cents,
      new_subscribers,
      updated_at
    )
    SELECT
      m.shop_domain,
      ${statDate}::date,
      COALESCE(campaign_stats.impressions, 0)::BIGINT,
      COALESCE(campaign_stats.clicks, 0)::BIGINT,
      COALESCE(campaign_stats.revenue_cents, 0)::BIGINT,
      0::BIGINT,
      0::BIGINT,
      0::BIGINT,
      COALESCE(subscriber_stats.new_subscribers, 0)::BIGINT,
      NOW()
    FROM merchants m
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(delivery_count), 0) AS impressions,
        COALESCE(SUM(click_count), 0) AS clicks,
        COALESCE(SUM(revenue_cents), 0) AS revenue_cents
      FROM campaigns
      WHERE shop_domain = m.shop_domain
        AND created_at >= ${dayStart}
        AND created_at <= ${dayEnd}
    ) campaign_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS new_subscribers
      FROM subscribers
      WHERE shop_domain = m.shop_domain
        AND created_at >= ${dayStart}
        AND created_at <= ${dayEnd}
    ) subscriber_stats ON TRUE
    WHERE m.uninstalled_at IS NULL
    ON CONFLICT (shop_domain, stat_date) DO UPDATE SET
      campaign_impressions = EXCLUDED.campaign_impressions,
      campaign_clicks = EXCLUDED.campaign_clicks,
      campaign_revenue_cents = EXCLUDED.campaign_revenue_cents,
      automation_impressions = EXCLUDED.automation_impressions,
      automation_clicks = EXCLUDED.automation_clicks,
      automation_revenue_cents = EXCLUDED.automation_revenue_cents,
      new_subscribers = EXCLUDED.new_subscribers,
      updated_at = NOW()
    RETURNING shop_domain
  `;

  // In d1_only the subscribers LATERAL above sees an empty Neon table, so patch the
  // new-subscriber counts from D1 (read/shadow keep Neon current via dual-write).
  const { isD1AudienceOnly, d1CountNewSubscribersPerShop } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  if (isD1AudienceOnly()) {
    const shopCounts = await d1CountNewSubscribersPerShop(
      dayStart.toISOString(),
      dayEnd.toISOString(),
    );
    for (const { shop_domain, count } of shopCounts) {
      if (!shop_domain || count <= 0) {
        continue;
      }
      await sql`
        UPDATE merchant_daily_stats
        SET new_subscribers = ${count}, updated_at = NOW()
        WHERE shop_domain = ${shop_domain} AND stat_date = ${statDate}::date
      `;
    }
  }

  const { isD1DeliveriesEnabled, d1GetAutomationDailyStatsPerShop } = await import(
    '@/lib/server/integrations/d1-deliveries'
  );
  if (isD1DeliveriesEnabled()) {
    const autoStats = await d1GetAutomationDailyStatsPerShop(
      dayStart.toISOString(),
      dayEnd.toISOString(),
    );
    for (const row of autoStats) {
      if (!row.shop_domain) {
        continue;
      }
      await sql`
        UPDATE merchant_daily_stats
        SET
          automation_impressions = ${row.impressions},
          automation_clicks = ${row.clicks},
          automation_revenue_cents = ${row.revenue_cents},
          updated_at = NOW()
        WHERE shop_domain = ${row.shop_domain} AND stat_date = ${statDate}::date
      `;
    }
  }

  return {
    statDate,
    shopsUpdated: rows.length,
  };
};

// Retention windows (days) for the high-volume, append-only time-series tables.
// These grow unbounded with sends/traffic and are the main driver of Neon storage
// and network transfer at scale. Historical analytics are preserved in the tiny
// merchant_daily_stats rollup, so pruning the raw rows below is safe for the
// dashboard. Windows are generous (well beyond any realistic attribution/dedup
// window) and overridable via env for tuning without a redeploy.
const readRetentionDays = (key: string, fallback: number) => {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Prunes the unbounded per-recipient delivery/click history and old Shopify
 * order/fulfillment cache rows from Neon. This is the single biggest lever for
 * staying inside the Neon free tier at scale: it caps row count (and therefore
 * storage + scan cost) regardless of total lifetime volume. Recent data
 * (attribution, welcome-step dedup, campaign detail views) is fully retained, and
 * lifetime merchant-visible stats are preserved durably: per-campaign totals on
 * the campaigns row, and per-rule automation totals in automation_rule_stats
 * (folded in atomically as rows are deleted, below).
 *
 * The plain campaign deletes deliberately omit RETURNING: at scale that would
 * stream every deleted id back over the wire and burn the very network transfer
 * we are trying to conserve. The automation folds DO use RETURNING, but it is
 * consumed server-side by the INSERT (never streamed to the app).
 */
export const pruneHighVolumeTimeSeries = async () => {
  await ensureSchema();
  const sql = getNeonSql();

  const now = Date.now();
  const deliveryDays = readRetentionDays('PE_RETENTION_DELIVERY_DAYS', 120);
  const orderDays = readRetentionDays('PE_RETENTION_ORDER_DAYS', 180);
  const fulfillmentDays = readRetentionDays('PE_RETENTION_FULFILLMENT_DAYS', 90);

  const deliveryCutoff = new Date(now - deliveryDays * DAY_MS);
  const orderCutoff = new Date(now - orderDays * DAY_MS);
  const fulfillmentCutoff = new Date(now - fulfillmentDays * DAY_MS);

  // Sequential to keep peak Neon compute/connections low during maintenance.
  //
  // Campaign detail can be deleted outright: per-campaign lifetime
  // impressions/clicks/revenue live durably on the campaigns row
  // (delivery_count / click_count / revenue_cents), which is maintained during
  // send/click/attribution and never derived from these rows.
  const {
    pruneCampaignDetail,
    pruneAutomationDeliveriesWithAggregates,
    pruneAutomationClicksWithAggregates,
    isD1DeliveriesEnabled,
  } = await import('@/lib/server/integrations/deliveries-data');

  await pruneCampaignDetail(deliveryCutoff.toISOString());

  const deliveryAggregates = await pruneAutomationDeliveriesWithAggregates(
    deliveryCutoff.toISOString(),
  );
  for (const agg of deliveryAggregates) {
    if (agg.impressions <= 0 && agg.revenue_cents <= 0) {
      continue;
    }
    await sql`
      INSERT INTO automation_rule_stats (
        shop_domain, rule_key, archived_impressions, archived_clicks, archived_revenue_cents, updated_at
      )
      VALUES (${agg.shop_domain}, ${agg.rule_key}, ${agg.impressions}, 0, ${agg.revenue_cents}, NOW())
      ON CONFLICT (shop_domain, rule_key) DO UPDATE SET
        archived_impressions = automation_rule_stats.archived_impressions + EXCLUDED.archived_impressions,
        archived_revenue_cents = automation_rule_stats.archived_revenue_cents + EXCLUDED.archived_revenue_cents,
        updated_at = NOW()
    `;
  }

  const clickAggregates = await pruneAutomationClicksWithAggregates(deliveryCutoff.toISOString());
  for (const agg of clickAggregates) {
    if (agg.clicks <= 0 && agg.revenue_cents <= 0) {
      continue;
    }
    await sql`
      INSERT INTO automation_rule_stats (
        shop_domain, rule_key, archived_impressions, archived_clicks, archived_revenue_cents, updated_at
      )
      VALUES (${agg.shop_domain}, ${agg.rule_key}, 0, ${agg.clicks}, ${agg.revenue_cents}, NOW())
      ON CONFLICT (shop_domain, rule_key) DO UPDATE SET
        archived_clicks = automation_rule_stats.archived_clicks + EXCLUDED.archived_clicks,
        archived_revenue_cents = automation_rule_stats.archived_revenue_cents + EXCLUDED.archived_revenue_cents,
        updated_at = NOW()
    `;
  }

  if (!isD1DeliveriesEnabled()) {
    // Neon path already pruned inside the helpers above when D1 is off.
  } else {
    const { neonTableExists } = await import('@/lib/server/integrations/neon-legacy-tables');
    if (await neonTableExists('campaign_deliveries')) {
      await sql`DELETE FROM campaign_deliveries WHERE delivered_at < ${deliveryCutoff}`;
    }
    if (await neonTableExists('campaign_clicks')) {
      await sql`DELETE FROM campaign_clicks WHERE clicked_at < ${deliveryCutoff}`;
    }
    if (await neonTableExists('automation_deliveries')) {
      await sql`DELETE FROM automation_deliveries WHERE delivered_at < ${deliveryCutoff}`;
    }
    if (await neonTableExists('automation_clicks')) {
      await sql`DELETE FROM automation_clicks WHERE clicked_at < ${deliveryCutoff}`;
    }
  }
  const { neonTableExists } = await import('@/lib/server/integrations/neon-legacy-tables');
  if (await neonTableExists('shopify_orders')) {
    await sql`DELETE FROM shopify_orders WHERE created_at < ${orderCutoff}`;
  }
  if (await neonTableExists('shopify_order_items')) {
    await sql`DELETE FROM shopify_order_items WHERE created_at < ${orderCutoff}`;
  }
  if (await neonTableExists('shopify_fulfillments')) {
    await sql`DELETE FROM shopify_fulfillments WHERE last_seen_at < ${fulfillmentCutoff}`;
  }

  // When commerce is on D1, prune it there with the same cutoffs. The Neon deletes
  // above stay as a cheap no-op safety net that also reclaims any pre-migration rows
  // still sitting on Neon after a cutover.
  try {
    const { isD1CommerceEnabled, d1PruneCommerce } = await import(
      '@/lib/server/integrations/d1-commerce'
    );
    if (isD1CommerceEnabled()) {
      await d1PruneCommerce({
        orderCutoffIso: orderCutoff.toISOString(),
        fulfillmentCutoffIso: fulfillmentCutoff.toISOString(),
      });
    }
  } catch (error) {
    console.error(
      '[retention] d1 commerce prune failed',
      error instanceof Error ? error.message : error,
    );
  }

  return {
    deliveryRetentionDays: deliveryDays,
    orderRetentionDays: orderDays,
    fulfillmentRetentionDays: fulfillmentDays,
  };
};

// Ensures the daily stats rollup runs at most once per UTC day even though heavy
// maintenance now fires on an interval (not at an exact wall-clock minute). The
// rollup is idempotent (ON CONFLICT), so if KV is unavailable we simply run it on
// every maintenance tick rather than risk skipping a day and losing history.
const ROLLUP_DAY_KEY = 'pe:rollup:day:v1';

const maybeRollupDailyStats = async () => {
  const target = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);

  try {
    const { isCloudflareKvEnabled, readKvJson, writeKvJson } = await import(
      '@/lib/server/cache/cloudflare-kv'
    );
    if (isCloudflareKvEnabled()) {
      const marker = await readKvJson<{ statDate?: string }>(ROLLUP_DAY_KEY);
      if (marker?.statDate === target) {
        return { statDate: target, skipped: true as const };
      }
      const result = await rollupMerchantDailyStats();
      void writeKvJson(ROLLUP_DAY_KEY, { statDate: target }, 3 * 24 * 60 * 60).catch(
        () => undefined,
      );
      return result;
    }
  } catch {
    // fall through to an unconditional (idempotent) rollup
  }

  return rollupMerchantDailyStats();
};

export const runRetentionMaintenance = async () => {
  await ensureSchema();
  const sql = getNeonSql();

  // Self-healing safety net for orphaned jobs. listDueAutomationJobs already
  // reclaims stale 'processing' rows (>2 min) — but only when it runs, which the
  // idle-sleeping cron skips entirely when the queue is otherwise empty. A job
  // that crashed mid-send during a quiet period would therefore stay stuck in
  // 'processing' forever (never counted as pending, never reclaimed). This
  // periodic sweep (>15 min, well beyond the 300s max cron duration) guarantees
  // any orphan is returned to 'pending' so the next tick delivers it. It runs on
  // the maintenance cadence only, so it can never keep the tick awake or affect
  // the Neon-sleep guarantee.
  const reclaimedStuckJobs = await sql`
    UPDATE automation_jobs
    SET status = 'pending', updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < NOW() - INTERVAL '15 minutes'
    RETURNING id
  `;

  await pruneAutomationData();

  // Roll up first so a completed day is captured before its raw rows can ever be
  // pruned, then cap the high-volume tables.
  const dailyRollup = await maybeRollupDailyStats();
  const highVolumePrune = await pruneHighVolumeTimeSeries();

  const ingestionDeleted = await sql`
    DELETE FROM ingestion_jobs
    WHERE status = 'processed'
      AND processed_at IS NOT NULL
      AND processed_at < NOW() - INTERVAL '7 days'
    RETURNING id
  `;

  const heartbeatsDeleted = await sql`
    DELETE FROM cron_heartbeats
    WHERE started_at < NOW() - INTERVAL '7 days'
    RETURNING id
  `;

  const { archiveOldPixelEvents } = await import('@/lib/server/automation/pixel-events');
  const pixelArchive = await archiveOldPixelEvents(14, 2000);

  const { pruneD1TrackingEvents, isD1EventsEnabled } = await import('@/lib/server/integrations/d1-events');
  // Pass undefined so the env-configured D1_EVENTS_RETENTION_DAYS applies.
  const d1Prune = isD1EventsEnabled() ? await pruneD1TrackingEvents(undefined, 2000) : null;
  const campaignMediaPrune = await pruneUnusedCampaignDeviceImages(30);

  return {
    ingestionJobsDeleted: ingestionDeleted.length,
    heartbeatsDeleted: heartbeatsDeleted.length,
    reclaimedStuckJobs: reclaimedStuckJobs.length,
    pixelArchive,
    d1Prune,
    campaignMediaPrune,
    highVolumePrune,
    dailyRollup,
  };
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
  const { isD1AudienceOnly } = await import('@/lib/server/integrations/d1-audience');
  // In d1_only, token/subscriber rows live in D1 — Neon FK columns must stay null;
  // processAutomationJob resolves the live token via payload.externalId in D1.
  const tokenId = isD1AudienceOnly() ? null : (input.tokenId ?? null);
  const subscriberId = isD1AudienceOnly() ? null : (input.subscriberId ?? null);

  const jobId = randomUUID();
  const dueAt = input.dueAt ?? new Date();

  if (input.dedupeKey) {
    await sql`
      DELETE FROM automation_jobs
      WHERE shop_domain = ${input.shopDomain}
        AND dedupe_key = ${input.dedupeKey}
        AND status IN ('failed', 'skipped')
    `;

    const refreshedRows = await sql`
      UPDATE automation_jobs
      SET
        due_at = ${dueAt},
        payload = ${JSON.stringify(input.payload)}::jsonb,
        status = 'pending',
        error_message = NULL,
        queue_enqueued_at = NULL,
        updated_at = NOW()
      WHERE shop_domain = ${input.shopDomain}
        AND dedupe_key = ${input.dedupeKey}
        AND status = 'pending'
      RETURNING id
    `;

    const refreshedId = refreshedRows[0] ? String(refreshedRows[0].id) : null;
    if (refreshedId) {
      const { queueAutomationJobAfterInsert } = await import('@/lib/server/automation/queue-scheduler');
      queueAutomationJobAfterInsert(refreshedId, dueAt);
      const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
      void bumpCronWakeNow();
      return refreshedId;
    }
  }

  const rows = await sql`
    INSERT INTO automation_jobs (id, shop_domain, rule_key, token_id, subscriber_id, dedupe_key, payload, due_at)
    VALUES (
      ${jobId},
      ${input.shopDomain},
      ${input.ruleKey},
      ${tokenId},
      ${subscriberId},
      ${input.dedupeKey ?? null},
      ${JSON.stringify(input.payload)}::jsonb,
      ${dueAt}
    )
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  const insertedId = rows[0] ? String(rows[0].id) : null;
  if (insertedId) {
    const { queueAutomationJobAfterInsert } = await import('@/lib/server/automation/queue-scheduler');
    queueAutomationJobAfterInsert(insertedId, dueAt);
    const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
    void bumpCronWakeNow();
  }

  return insertedId;
};

export const startCronHeartbeat = async (jobName: string, metadata?: Record<string, unknown> | null) => {
  await ensureSchema();
  const sql = getNeonSql();
  const heartbeatId = randomUUID();

  await sql`
    INSERT INTO cron_heartbeats (id, job_name, status, started_at, metadata)
    VALUES (
      ${heartbeatId},
      ${jobName},
      'running',
      NOW(),
      ${JSON.stringify(metadata ?? {})}::jsonb
    )
  `;

  return heartbeatId;
};

export const completeCronHeartbeat = async (input: {
  heartbeatId: string;
  ok: boolean;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
}) => {
  await ensureSchema();
  const sql = getNeonSql();

  await sql`
    UPDATE cron_heartbeats
    SET
      status = ${input.ok ? 'ok' : 'error'},
      completed_at = NOW(),
      error_message = ${input.errorMessage ?? null},
      metadata = CASE
        WHEN ${JSON.stringify(input.metadata ?? null)}::jsonb IS NULL THEN metadata
        ELSE ${JSON.stringify(input.metadata ?? {})}::jsonb
      END
    WHERE id = ${input.heartbeatId}
  `;
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
  if (rows[0]) {
    return String(rows[0].id);
  }

  if (!input.dedupeKey) {
    return null;
  }

  const existingRows = await sql`
    SELECT id
    FROM ingestion_jobs
    WHERE shop_domain = ${input.shopDomain}
      AND job_type = ${input.jobType}
      AND dedupe_key = ${input.dedupeKey}
      AND status IN ('pending', 'processing')
    ORDER BY created_at DESC
    LIMIT 1
  `;

  return existingRows[0] ? String(existingRows[0].id) : null;
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

export const ingestStorefrontPixelEventDirect = async (payload: PixelIngestionPayload) => {
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

  if (payload.eventType === 'page_view') {
    return { processed: true, pixelEventId, skippedActivity: true };
  }

  await recordSubscriberActivity({
    shopDomain: payload.shopDomain,
    externalId: payload.externalId,
    eventType: payload.eventType,
    pageUrl: payload.pageUrl,
    productId: payload.productId,
    cartToken: payload.cartToken,
    metadata: {
      ...(payload.metadata ?? {}),
      clientId: payload.clientId ?? null,
      pixelEventId,
    },
    skipActivityPersist: payload.eventType !== 'checkout_complete' && payload.eventType !== 'checkout_start',
  });

  if (payload.eventType === 'checkout_complete') {
    const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
    const rawOrderId = metadata.orderId ? String(metadata.orderId).trim() : '';
    const orderId = rawOrderId ? rawOrderId.split('/').pop() || rawOrderId : '';
    const totalPriceCentsRaw = Number(metadata.checkoutTotalPriceCents ?? 0);
    const totalPriceCents = Number.isFinite(totalPriceCentsRaw) && totalPriceCentsRaw >= 0
      ? Math.round(totalPriceCentsRaw)
      : 0;

    if (orderId) {
      const occurredAtRaw = metadata.timestamp ? String(metadata.timestamp) : null;
      const occurredAt = occurredAtRaw && !Number.isNaN(Date.parse(occurredAtRaw)) ? occurredAtRaw : null;

      await upsertShopifyOrderEvent({
        shopDomain: payload.shopDomain,
        orderId,
        externalId: payload.externalId,
        totalPriceCents,
        createdAt: occurredAt,
        lineItems: [],
      });

      await recordAttributedConversion({
        shopDomain: payload.shopDomain,
        orderId,
        revenueCents: totalPriceCents,
        occurredAt,
        externalId: payload.externalId,
        cartToken: payload.cartToken ?? null,
        clientId: payload.clientId ?? null,
      });
    }
  }

  return { processed: true, pixelEventId };
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
      await ingestStorefrontPixelEventDirect(payload);
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
        cartToken: payload.cartToken ?? null,
        clientId: payload.clientId ?? null,
        customerId: payload.customerId ?? null,
        email: payload.email ?? null,
        campaignId: getCampaignIdFromLandingSite(payload.landingSite),
        ipAddress: payload.browserIp ?? null,
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

  // If a worker crashed mid-flight, move stale processing jobs back to pending (shard-scoped).
  await sql`
    UPDATE automation_jobs
    SET status = 'pending', updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < NOW() - INTERVAL '2 minutes'
      AND (
        ${safeShardCount} = 1
        OR MOD(ABS(hashtext(id)), ${safeShardCount}) = ${safeShardIndex}
      )
  `;

  const { isD1AudienceReadActive, d1GetFcmTokensByIds } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  const readActive = isD1AudienceReadActive();

  const rows = readActive
    ? await sql`
      SELECT j.id, j.shop_domain, j.rule_key, j.token_id, j.subscriber_id, j.payload
      FROM automation_jobs j
      WHERE j.status = 'pending'
        AND j.due_at <= NOW()
        AND (
          j.queue_enqueued_at IS NULL
          OR j.due_at <= NOW() - INTERVAL '90 seconds'
        )
        AND (
          ${safeShardCount} = 1
          OR MOD(ABS(hashtext(j.id)), ${safeShardCount}) = ${safeShardIndex}
        )
      ORDER BY j.due_at ASC
      LIMIT ${limit}
    `
    : await sql`
      SELECT j.id, j.shop_domain, j.rule_key, j.token_id, j.subscriber_id, j.payload, t.fcm_token
      FROM automation_jobs j
      LEFT JOIN subscriber_tokens t ON t.id = j.token_id
      WHERE j.status = 'pending'
        AND j.due_at <= NOW()
        AND (
          j.queue_enqueued_at IS NULL
          OR j.due_at <= NOW() - INTERVAL '90 seconds'
        )
        AND (
          ${safeShardCount} = 1
          OR MOD(ABS(hashtext(j.id)), ${safeShardCount}) = ${safeShardIndex}
        )
      ORDER BY j.due_at ASC
      LIMIT ${limit}
    `;

  if (readActive) {
    // fcm_token is not consumed by the cron/queue path (processAutomationJob re-reads
    // the token); enrich from D1 only to keep the returned shape identical.
    const tokenIds = rows.map((row) => Number(row.token_id)).filter((id) => Number.isFinite(id));
    const fcmMap =
      tokenIds.length > 0 ? await d1GetFcmTokensByIds(tokenIds) : new Map<number, string>();
    for (const row of rows) {
      (row as { fcm_token: string | null }).fcm_token =
        row.token_id != null ? fcmMap.get(Number(row.token_id)) ?? null : null;
    }
  }

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

export const listDueAutomationJobsByRule = async (
  ruleKey: AutomationRuleKey,
  limit = 100,
  shardCount = 1,
  shardIndex = 0,
) => {
  await ensureSchema();
  const sql = getNeonSql();
  const safeShardCount = Math.max(1, Math.min(Number(shardCount) || 1, 128));
  const safeShardIndex = Math.max(0, Math.min(Number(shardIndex) || 0, safeShardCount - 1));

  // If a worker crashed mid-flight, move stale processing jobs for this rule back to pending (shard-scoped).
  await sql`
    UPDATE automation_jobs
    SET status = 'pending', updated_at = NOW()
    WHERE status = 'processing'
      AND rule_key = ${ruleKey}
      AND updated_at < NOW() - INTERVAL '2 minutes'
      AND (
        ${safeShardCount} = 1
        OR MOD(ABS(hashtext(id)), ${safeShardCount}) = ${safeShardIndex}
      )
  `;

  const { isD1AudienceReadActive, d1GetFcmTokensByIds } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  const readActive = isD1AudienceReadActive();

  const rows = readActive
    ? await sql`
      SELECT j.id, j.shop_domain, j.rule_key, j.token_id, j.subscriber_id, j.payload
      FROM automation_jobs j
      WHERE j.status = 'pending'
        AND j.rule_key = ${ruleKey}
        AND j.due_at <= NOW()
        AND (
          j.queue_enqueued_at IS NULL
          OR j.due_at <= NOW() - INTERVAL '90 seconds'
        )
        AND (
          ${safeShardCount} = 1
          OR MOD(ABS(hashtext(j.id)), ${safeShardCount}) = ${safeShardIndex}
        )
      ORDER BY j.due_at ASC
      LIMIT ${limit}
    `
    : await sql`
      SELECT j.id, j.shop_domain, j.rule_key, j.token_id, j.subscriber_id, j.payload, t.fcm_token
      FROM automation_jobs j
      LEFT JOIN subscriber_tokens t ON t.id = j.token_id
      WHERE j.status = 'pending'
        AND j.rule_key = ${ruleKey}
        AND j.due_at <= NOW()
        AND (
          j.queue_enqueued_at IS NULL
          OR j.due_at <= NOW() - INTERVAL '90 seconds'
        )
        AND (
          ${safeShardCount} = 1
          OR MOD(ABS(hashtext(j.id)), ${safeShardCount}) = ${safeShardIndex}
        )
      ORDER BY j.due_at ASC
      LIMIT ${limit}
    `;

  if (readActive) {
    const tokenIds = rows.map((row) => Number(row.token_id)).filter((id) => Number.isFinite(id));
    const fcmMap =
      tokenIds.length > 0 ? await d1GetFcmTokensByIds(tokenIds) : new Map<number, string>();
    for (const row of rows) {
      (row as { fcm_token: string | null }).fcm_token =
        row.token_id != null ? fcmMap.get(Number(row.token_id)) ?? null : null;
    }
  }

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

const rescheduleAutomationJobAfterDefer = async (jobId: string, dueAt: Date) => {
  const { clearAutomationJobQueueMarker, rescheduleAutomationJobInQueue } = await import(
    '@/lib/server/automation/queue-scheduler'
  );
  await clearAutomationJobQueueMarker(jobId);
  void rescheduleAutomationJobInQueue(jobId, dueAt).catch((error) => {
    console.error('[automation-queue] defer reschedule failed', jobId, error);
  });
};

export const processAutomationJob = async (jobId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const claimRows = await sql`
    UPDATE automation_jobs
    SET status = 'processing', attempts = attempts + 1, updated_at = NOW()
    WHERE id = ${jobId}
      AND status = 'pending'
    RETURNING id, shop_domain, rule_key, token_id, subscriber_id, payload, attempts
  `;

  const claim = claimRows[0] as
    | {
      id: string;
      shop_domain: string;
      rule_key: string;
      token_id: number | null;
      subscriber_id: number | null;
      payload: AutomationJobPayload;
      attempts: number;
    }
    | undefined;
  if (!claim) {
    return { processed: false };
  }

  // Audience reads route to D1 in read/d1_only (Neon fallback on error), run both
  // in shadow, and stay on Neon otherwise. token_id/subscriber_id come from the
  // Neon automation_jobs claim above; the token/subscriber rows live in D1.
  const {
    audienceRead: audRead,
    d1GetTokenRowById,
    d1GetBestTargetableTokenBySubscriberId,
    d1GetBestTargetableTokenByExternalId,
    d1GetSubscriberPlatformBrowserById,
    d1GetSubscriberPlatformBrowserByExternalId,
  } = await import('@/lib/server/integrations/d1-audience');
  const tokenShadowKey = (row: any) =>
    row
      ? `${row.fcm_token ?? ''}|${row.token_type ?? ''}|${row.status ?? ''}|${row.vapid_endpoint ?? ''}`
      : 'none';

  let activeTokenRow: any = await audRead<any>({
    label: 'processAutomationJob.tokenById',
    key: tokenShadowKey,
    neon: async () => {
      const rows = await sql`
        SELECT id, fcm_token, token_type, vapid_endpoint, vapid_p256dh, vapid_auth, status, user_agent
        FROM subscriber_tokens
        WHERE id = ${claim.token_id ?? 0}
        LIMIT 1
      `;
      return rows[0] ?? null;
    },
    d1: async () => (claim.token_id ? await d1GetTokenRowById(claim.token_id) : null),
  });
  let token = String(activeTokenRow?.fcm_token ?? '');
  let tokenType = String(activeTokenRow?.token_type ?? 'fcm');
  let tokenStatus = String(activeTokenRow?.status ?? '');
  let deliveryTokenId = claim.token_id ?? null;

  if ((!token || tokenStatus !== 'active') && claim.subscriber_id) {
    const fallbackRow: any = await audRead<any>({
      label: 'processAutomationJob.tokenBySubscriber',
      key: tokenShadowKey,
      neon: async () => {
        const rows = await sql`
          SELECT id, fcm_token, token_type, vapid_endpoint, vapid_p256dh, vapid_auth, status, user_agent
          FROM subscriber_tokens
          WHERE shop_domain = ${claim.shop_domain}
            AND subscriber_id = ${claim.subscriber_id}
            AND status = 'active'
            AND (
              COALESCE(token_type, 'fcm') <> 'vapid'
              OR (
                COALESCE(vapid_endpoint, '') <> ''
                AND COALESCE(vapid_p256dh, '') <> ''
                AND COALESCE(vapid_auth, '') <> ''
              )
            )
          ORDER BY last_seen_at DESC NULLS LAST, updated_at DESC
          LIMIT 1
        `;
        return rows[0] ?? null;
      },
      d1: async () =>
        claim.subscriber_id
          ? await d1GetBestTargetableTokenBySubscriberId(claim.shop_domain, claim.subscriber_id)
          : null,
    });

    if (fallbackRow) {
      activeTokenRow = fallbackRow;
      token = String(activeTokenRow?.fcm_token ?? '');
      tokenType = String(activeTokenRow?.token_type ?? 'fcm');
      tokenStatus = String(activeTokenRow?.status ?? '');
      deliveryTokenId = Number(fallbackRow?.id ?? 0) || deliveryTokenId;
    }
  }

  if ((!token || tokenStatus !== 'active') && claim.payload?.externalId) {
    const externalId = String(claim.payload.externalId);
    const fallbackRow: any = await audRead<any>({
      label: 'processAutomationJob.tokenByExternal',
      key: tokenShadowKey,
      neon: async () => {
        const rows = await sql`
          SELECT t.id, t.fcm_token, t.token_type, t.vapid_endpoint, t.vapid_p256dh, t.vapid_auth, t.status, t.user_agent
          FROM subscriber_tokens t
          JOIN subscribers s ON s.id = t.subscriber_id
          WHERE t.shop_domain = ${claim.shop_domain}
            AND s.external_id = ${externalId}
            AND t.status = 'active'
            AND (
              COALESCE(t.token_type, 'fcm') <> 'vapid'
              OR (
                COALESCE(t.vapid_endpoint, '') <> ''
                AND COALESCE(t.vapid_p256dh, '') <> ''
                AND COALESCE(t.vapid_auth, '') <> ''
              )
            )
          ORDER BY t.last_seen_at DESC NULLS LAST, t.updated_at DESC
          LIMIT 1
        `;
        return rows[0] ?? null;
      },
      d1: async () => await d1GetBestTargetableTokenByExternalId(claim.shop_domain, externalId),
    });

    if (fallbackRow) {
      activeTokenRow = fallbackRow;
      token = String(activeTokenRow?.fcm_token ?? '');
      tokenType = String(activeTokenRow?.token_type ?? 'fcm');
      tokenStatus = String(activeTokenRow?.status ?? '');
      deliveryTokenId = Number(fallbackRow?.id ?? 0) || deliveryTokenId;
    }
  }

  if (!token || tokenStatus !== 'active') {
    const isCartReminder = claim.rule_key === 'cart_abandonment_30m';
    const maxMissingTokenRetries = isCartReminder ? 12 : 8;
    const attempts = Number(claim.attempts ?? 0);
    const shouldFail = attempts >= maxMissingTokenRetries;
    const errorMessage = shouldFail
      ? 'Missing active token.'
      : 'Missing active token. Waiting for token refresh.';
    const isWelcome = claim.rule_key === 'welcome_subscriber';
    const deferMs = isWelcome
      ? (attempts <= 3 ? 5_000 : 15_000)
      : isCartReminder
        ? 30_000
        : 60_000;

    if (shouldFail) {
      await sql`
        UPDATE automation_jobs
        SET status = 'failed',
            error_message = ${errorMessage},
            updated_at = NOW()
        WHERE id = ${jobId}
      `;
    } else {
      const deferredDueAt = new Date(Date.now() + deferMs);
      await sql`
        UPDATE automation_jobs
        SET status = 'pending',
            error_message = ${errorMessage},
            due_at = ${deferredDueAt},
            queue_enqueued_at = NULL,
            updated_at = NOW()
        WHERE id = ${jobId}
      `;
      await rescheduleAutomationJobAfterDefer(jobId, deferredDueAt);
    }
    return { processed: false, error: errorMessage };
  }

  try {
    let payload = claim.payload ?? { title: 'Notification', body: '' };
    let subscriberPlatform: string | null = null;
    let subscriberBrowser: string | null = null;

    if (claim.subscriber_id) {
      const pb = await audRead<{ platform: string | null; browser: string | null } | null>({
        label: 'processAutomationJob.subscriberById',
        key: (r) => `${r?.platform ?? ''}|${r?.browser ?? ''}`,
        neon: async () => {
          const rows = await sql`
            SELECT platform, browser
            FROM subscribers
            WHERE id = ${claim.subscriber_id}
            LIMIT 1
          `;
          return rows[0]
            ? {
                platform: rows[0].platform == null ? null : String(rows[0].platform),
                browser: rows[0].browser == null ? null : String(rows[0].browser),
              }
            : null;
        },
        d1: async () =>
          claim.subscriber_id ? await d1GetSubscriberPlatformBrowserById(claim.subscriber_id) : null,
      });
      subscriberPlatform = pb?.platform ?? null;
      subscriberBrowser = pb?.browser ?? null;
    } else if (payload.externalId) {
      const externalId = String(payload.externalId);
      const pb = await audRead<{ platform: string | null; browser: string | null } | null>({
        label: 'processAutomationJob.subscriberByExternal',
        key: (r) => `${r?.platform ?? ''}|${r?.browser ?? ''}`,
        neon: async () => {
          const rows = await sql`
            SELECT platform, browser
            FROM subscribers
            WHERE shop_domain = ${claim.shop_domain}
              AND external_id = ${externalId}
            LIMIT 1
          `;
          return rows[0]
            ? {
                platform: rows[0].platform == null ? null : String(rows[0].platform),
                browser: rows[0].browser == null ? null : String(rows[0].browser),
              }
            : null;
        },
        d1: async () => await d1GetSubscriberPlatformBrowserByExternalId(claim.shop_domain, externalId),
      });
      subscriberPlatform = pb?.platform ?? null;
      subscriberBrowser = pb?.browser ?? null;
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
      const { findAutomationDeliveryJobIdJoined, findAutomationDeliveryIdForPreviousStep } =
        await import('@/lib/server/integrations/deliveries-data');
      const welcomeConfig = parseWelcomeRuleConfig(ruleRows[0]?.config ?? null);
      const step = welcomeConfig.steps[payloadStepKey as WelcomeStepKey];
      const welcomeStepOrder: WelcomeStepKey[] = ['reminder-1', 'reminder-2', 'reminder-3'];

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

        const existingDeliveryJobId =
          (await findAutomationDeliveryJobIdJoined({
            shopDomain: claim.shop_domain,
            ruleKey: 'welcome_subscriber',
            stepKey: payloadStepKey,
            externalId: payloadExternalId,
          })) ?? '';
        if (existingDeliveryJobId && existingDeliveryJobId !== claim.id) {
          await sql`
            UPDATE automation_jobs
            SET status = 'skipped', error_message = 'Welcome reminder already delivered for this step.', updated_at = NOW()
            WHERE id = ${jobId}
          `;
          return { processed: false, error: 'Welcome reminder already delivered for this step.' };
        }
      }

      if (claim.subscriber_id) {
        const canonicalSubscriberWelcomeRows = await sql`
          SELECT id
          FROM automation_jobs
          WHERE shop_domain = ${claim.shop_domain}
            AND rule_key = 'welcome_subscriber'
            AND subscriber_id = ${claim.subscriber_id}
            AND payload -> 'metadata' ->> 'stepKey' = ${payloadStepKey}
            AND status IN ('pending', 'processing', 'sent')
          ORDER BY created_at ASC
          LIMIT 1
        `;

        const canonicalSubscriberWelcomeJobId = canonicalSubscriberWelcomeRows[0]?.id == null ? '' : String(canonicalSubscriberWelcomeRows[0].id);
        if (canonicalSubscriberWelcomeJobId && canonicalSubscriberWelcomeJobId !== claim.id) {
          await sql`
            UPDATE automation_jobs
            SET status = 'skipped', error_message = 'Duplicate welcome reminder job suppressed for subscriber.', updated_at = NOW()
            WHERE id = ${jobId}
          `;
          return { processed: false, error: 'Duplicate welcome reminder job suppressed for subscriber.' };
        }
      }

      const currentStepIndex = welcomeStepOrder.indexOf(payloadStepKey as WelcomeStepKey);
      if (currentStepIndex > 0) {
        const previousStepKey = welcomeStepOrder[currentStepIndex - 1];
        const payloadExternalIdForOrdering = payload.externalId == null ? '' : String(payload.externalId);

        const previousDeliveredId = payloadExternalIdForOrdering
          ? await findAutomationDeliveryIdForPreviousStep({
              shopDomain: claim.shop_domain,
              ruleKey: 'welcome_subscriber',
              stepKey: previousStepKey,
              externalId: payloadExternalIdForOrdering,
            })
          : claim.subscriber_id
            ? await findAutomationDeliveryIdForPreviousStep({
                shopDomain: claim.shop_domain,
                ruleKey: 'welcome_subscriber',
                stepKey: previousStepKey,
                subscriberId: claim.subscriber_id,
              })
            : null;

        if (!previousDeliveredId) {
          const previousPendingRows = payloadExternalIdForOrdering
            ? await sql`
              SELECT id
              FROM automation_jobs
              WHERE shop_domain = ${claim.shop_domain}
                AND rule_key = 'welcome_subscriber'
                AND payload ->> 'externalId' = ${payloadExternalIdForOrdering}
                AND payload -> 'metadata' ->> 'stepKey' = ${previousStepKey}
                AND status IN ('pending', 'processing', 'sent')
              ORDER BY created_at ASC
              LIMIT 1
            `
            : claim.subscriber_id
              ? await sql`
                SELECT id
                FROM automation_jobs
                WHERE shop_domain = ${claim.shop_domain}
                  AND rule_key = 'welcome_subscriber'
                  AND subscriber_id = ${claim.subscriber_id}
                  AND payload -> 'metadata' ->> 'stepKey' = ${previousStepKey}
                  AND status IN ('pending', 'processing', 'sent')
                ORDER BY created_at ASC
                LIMIT 1
              `
              : [];

          if (previousPendingRows[0]?.id) {
            const waitMessage = `Waiting for previous welcome step (${previousStepKey}) before sending ${payloadStepKey}.`;
            const deferredDueAt = new Date(Date.now() + 90_000);
            await sql`
              UPDATE automation_jobs
              SET status = 'pending',
                  error_message = ${waitMessage},
                  due_at = ${deferredDueAt},
                  queue_enqueued_at = NULL,
                  updated_at = NOW()
              WHERE id = ${jobId}
            `;
            await rescheduleAutomationJobAfterDefer(jobId, deferredDueAt);
            return { processed: false, error: waitMessage };
          }
        }
      }

      const tokenDeliveryJobId =
        (await findAutomationDeliveryJobIdJoined({
          shopDomain: claim.shop_domain,
          ruleKey: 'welcome_subscriber',
          stepKey: payloadStepKey,
          tokenId: deliveryTokenId ?? 0,
        })) ?? '';

      if (tokenDeliveryJobId) {
        await sql`
          UPDATE automation_jobs
          SET status = 'skipped', error_message = 'Welcome reminder already delivered to token for this step.', updated_at = NOW()
          WHERE id = ${jobId}
        `;
        return { processed: false, error: 'Welcome reminder already delivered to token for this step.' };
      }

      if (claim.subscriber_id) {
        const subscriberDeliveryJobId =
          (await findAutomationDeliveryJobIdJoined({
            shopDomain: claim.shop_domain,
            ruleKey: 'welcome_subscriber',
            stepKey: payloadStepKey,
            subscriberId: claim.subscriber_id,
          })) ?? '';

        if (subscriberDeliveryJobId) {
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
      const { findAutomationDeliveryJobIdJoined } = await import(
        '@/lib/server/integrations/deliveries-data'
      );
      const cartConfig = parseCartRuleConfig(ruleRows[0]?.config ?? null);
      const step = cartConfig.steps[payloadStepKey as CartStepKey];
      const cartStepOrder: CartStepKey[] = ['cart-reminder-1', 'cart-reminder-2', 'cart-reminder-3'];
      const payloadExternalId = payload.externalId == null ? '' : String(payload.externalId);
      const payloadCartToken = payload.cartToken == null ? '' : String(payload.cartToken);
      const payloadTriggeredAtRaw = payload.triggeredAt == null ? '' : String(payload.triggeredAt);
      const payloadTriggeredAt = payloadTriggeredAtRaw && !Number.isNaN(Date.parse(payloadTriggeredAtRaw))
        ? new Date(payloadTriggeredAtRaw)
        : null;

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

      const { resolveCartReminderProductImage } = await import('@/lib/server/automation/cart-abandonment-products');
      const cartProductIds = Array.isArray(payload.metadata?.cartProductIds)
        ? (payload.metadata.cartProductIds as string[]).map((value) => String(value).trim()).filter(Boolean)
        : [];
      const cartProductImage = await resolveCartReminderProductImage({
        shopDomain: claim.shop_domain,
        stepKey: payloadStepKey as CartStepKey,
        cartProductIds,
        cartToken: payloadCartToken || null,
        externalId: payloadExternalId || null,
        fallbackProductId: payload.productId == null ? null : String(payload.productId),
      });

      if (cartProductImage) {
        payload = {
          ...payload,
          imageUrl: cartProductImage,
          windowsImageUrl: cartProductImage,
          macosImageUrl: cartProductImage,
          androidImageUrl: cartProductImage,
        };
      }

      const checkoutAlreadyComplete = await hasCheckoutCompleteSince({
        shopDomain: claim.shop_domain,
        externalId: payloadExternalId || null,
        cartToken: payloadCartToken || null,
        since: payloadTriggeredAt,
      });

      if (checkoutAlreadyComplete) {
        await sql`
          UPDATE automation_jobs
          SET status = 'skipped', error_message = 'Cart recovered before reminder send.', updated_at = NOW()
          WHERE id = ${jobId}
        `;
        return { processed: false, error: 'Cart recovered before reminder send.' };
      }

      const stepIndex = cartStepOrder.indexOf(payloadStepKey as CartStepKey);
      if (stepIndex > 0) {
        const previousStepKey = cartStepOrder[stepIndex - 1];
        const hasIdentityForStepOrdering = Boolean(payloadExternalId || payloadCartToken || claim.subscriber_id);
        const previousCartStepJobId = await findAutomationDeliveryJobIdJoined({
          shopDomain: claim.shop_domain,
          ruleKey: 'cart_abandonment_30m',
          stepKey: previousStepKey,
          externalId: payloadExternalId || null,
          cartToken: payloadCartToken || null,
          subscriberId: claim.subscriber_id,
        });

        if (!previousCartStepJobId && hasIdentityForStepOrdering) {
          const previousStepJobRows = payloadExternalId && payloadCartToken && claim.subscriber_id
            ? await sql`
              SELECT status, attempts, error_message
              FROM automation_jobs
              WHERE shop_domain = ${claim.shop_domain}
                AND rule_key = 'cart_abandonment_30m'
                AND payload -> 'metadata' ->> 'stepKey' = ${previousStepKey}
                AND (
                  payload ->> 'externalId' = ${payloadExternalId}
                  OR payload ->> 'cartToken' = ${payloadCartToken}
                  OR subscriber_id = ${claim.subscriber_id}
                )
              ORDER BY created_at DESC
              LIMIT 1
            `
            : payloadExternalId && payloadCartToken
              ? await sql`
                SELECT status, attempts, error_message
                FROM automation_jobs
                WHERE shop_domain = ${claim.shop_domain}
                  AND rule_key = 'cart_abandonment_30m'
                  AND payload -> 'metadata' ->> 'stepKey' = ${previousStepKey}
                  AND (
                    payload ->> 'externalId' = ${payloadExternalId}
                    OR payload ->> 'cartToken' = ${payloadCartToken}
                  )
                ORDER BY created_at DESC
                LIMIT 1
              `
              : payloadExternalId && claim.subscriber_id
                ? await sql`
                  SELECT status, attempts, error_message
                  FROM automation_jobs
                  WHERE shop_domain = ${claim.shop_domain}
                    AND rule_key = 'cart_abandonment_30m'
                    AND payload -> 'metadata' ->> 'stepKey' = ${previousStepKey}
                    AND (
                      payload ->> 'externalId' = ${payloadExternalId}
                      OR subscriber_id = ${claim.subscriber_id}
                    )
                  ORDER BY created_at DESC
                  LIMIT 1
                `
                : payloadCartToken && claim.subscriber_id
                  ? await sql`
                    SELECT status, attempts, error_message
                    FROM automation_jobs
                    WHERE shop_domain = ${claim.shop_domain}
                      AND rule_key = 'cart_abandonment_30m'
                      AND payload -> 'metadata' ->> 'stepKey' = ${previousStepKey}
                      AND (
                        payload ->> 'cartToken' = ${payloadCartToken}
                        OR subscriber_id = ${claim.subscriber_id}
                      )
                    ORDER BY created_at DESC
                    LIMIT 1
                  `
                  : payloadExternalId
                    ? await sql`
                      SELECT status, attempts, error_message
                      FROM automation_jobs
                      WHERE shop_domain = ${claim.shop_domain}
                        AND rule_key = 'cart_abandonment_30m'
                        AND payload -> 'metadata' ->> 'stepKey' = ${previousStepKey}
                        AND payload ->> 'externalId' = ${payloadExternalId}
                      ORDER BY created_at DESC
                      LIMIT 1
                    `
                    : payloadCartToken
                      ? await sql`
                        SELECT status, attempts, error_message
                        FROM automation_jobs
                        WHERE shop_domain = ${claim.shop_domain}
                          AND rule_key = 'cart_abandonment_30m'
                          AND payload -> 'metadata' ->> 'stepKey' = ${previousStepKey}
                          AND payload ->> 'cartToken' = ${payloadCartToken}
                        ORDER BY created_at DESC
                        LIMIT 1
                      `
                      : claim.subscriber_id
                        ? await sql`
                          SELECT status, attempts, error_message
                          FROM automation_jobs
                          WHERE shop_domain = ${claim.shop_domain}
                            AND rule_key = 'cart_abandonment_30m'
                            AND payload -> 'metadata' ->> 'stepKey' = ${previousStepKey}
                            AND subscriber_id = ${claim.subscriber_id}
                          ORDER BY created_at DESC
                          LIMIT 1
                        `
                        : [];

          const previousStepStatus = previousStepJobRows[0]?.status == null
            ? ''
            : String(previousStepJobRows[0].status).toLowerCase();
          const previousStepAttempts = Number(previousStepJobRows[0]?.attempts ?? 0);
          const previousStepError = String(previousStepJobRows[0]?.error_message ?? '').trim();
          const previousStepLooksStuck =
            previousStepStatus === 'pending'
            && previousStepAttempts >= 3
            && previousStepError.length > 0;

          if ((previousStepStatus === 'pending' && !previousStepLooksStuck) || previousStepStatus === 'processing' || previousStepStatus === 'sent') {
            const waitMessage = `Waiting for previous cart reminder step (${previousStepKey}) before sending ${payloadStepKey}.`;
            const deferredDueAt = new Date(Date.now() + 60_000);
            await sql`
              UPDATE automation_jobs
              SET status = 'pending',
                  error_message = ${waitMessage},
                  due_at = ${deferredDueAt},
                  queue_enqueued_at = NULL,
                  updated_at = NOW()
              WHERE id = ${jobId}
            `;
            await rescheduleAutomationJobAfterDefer(jobId, deferredDueAt);
            return { processed: false, error: waitMessage };
          }

          if (previousStepStatus === 'skipped') {
            const intentionalSkip =
              previousStepError.includes('Cart recovered')
              || previousStepError.includes('checkout')
              || previousStepError.includes('disabled')
              || previousStepError.includes('already delivered');
            if (intentionalSkip) {
              const skipMessage = `Skipping ${payloadStepKey} because previous cart reminder step (${previousStepKey}) was intentionally skipped.`;
              await sql`
                UPDATE automation_jobs
                SET status = 'skipped', error_message = ${skipMessage}, updated_at = NOW()
                WHERE id = ${jobId}
              `;
              return { processed: false, error: skipMessage };
            }
          }
        }
      }

      const existingCartStepJobId = await findAutomationDeliveryJobIdJoined({
        shopDomain: claim.shop_domain,
        ruleKey: 'cart_abandonment_30m',
        stepKey: payloadStepKey,
        externalId: payloadExternalId || null,
        cartToken: payloadCartToken || null,
        subscriberId: claim.subscriber_id,
      });

      if (existingCartStepJobId) {
        await sql`
          UPDATE automation_jobs
          SET status = 'skipped', error_message = 'Cart reminder already delivered for this step.', updated_at = NOW()
          WHERE id = ${jobId}
        `;
        return { processed: false, error: 'Cart reminder already delivered for this step.' };
      }
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

    const { assertCanSendNotifications, incrementBillingImpressions } = await import(
      '@/lib/server/billing/merchant-billing'
    );
    await assertCanSendNotifications(claim.shop_domain, 1);

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

    const effectiveRuleKey = (payload.ruleKey ?? claim.rule_key) as AutomationRuleKey;
    const trackedTargetUrl = buildAutomationTrackedUrl(
      payload.targetUrl ?? null,
      effectiveRuleKey,
      claim.shop_domain,
      payload.externalId ?? null,
    ) ?? payload.targetUrl ?? null;

    let fcmMessageId: string;

    const rawActionButtons = Array.isArray((payload.metadata ?? {}).actionButtons)
      ? ((payload.metadata ?? {}).actionButtons as Array<Record<string, unknown>>)
      : [];
    const automationActions = rawActionButtons
      .slice(0, 2)
      .filter((btn) => btn?.title && btn?.link)
      .map((btn, i) => ({ action: `btn_${i + 1}`, title: String(btn.title) }));
    const automationButton1Url = rawActionButtons[0]?.link
      ? buildAutomationTrackedUrl(String(rawActionButtons[0].link), effectiveRuleKey, claim.shop_domain, payload.externalId ?? null)
      : (rawActionButtons[0]?.link ? String(rawActionButtons[0].link) : '');
    const automationButton2Url = rawActionButtons[1]?.link
      ? buildAutomationTrackedUrl(String(rawActionButtons[1].link), effectiveRuleKey, claim.shop_domain, payload.externalId ?? null)
      : (rawActionButtons[1]?.link ? String(rawActionButtons[1].link) : '');
    const primaryTrackUrl = buildAutomationClickTrackingUrl(
      trackedTargetUrl,
      effectiveRuleKey,
      claim.shop_domain,
      payload.externalId ?? null,
    );
    const button1TrackUrl = buildAutomationClickTrackingUrl(
      automationButton1Url,
      effectiveRuleKey,
      claim.shop_domain,
      payload.externalId ?? null,
    );
    const button2TrackUrl = buildAutomationClickTrackingUrl(
      automationButton2Url,
      effectiveRuleKey,
      claim.shop_domain,
      payload.externalId ?? null,
    );
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
          trackPrimaryUrl: primaryTrackUrl || null,
          trackButton1Url: button1TrackUrl || null,
          trackButton2Url: button2TrackUrl || null,
        },
      );
    } else {
      // FCM send for Chrome / Edge / Opera / Samsung
      const messaging = getFirebaseAdminMessaging();
      const message = {
        token,
        data: {
          source: 'automation',
          ruleKey: String(payload.ruleKey ?? ''),
          title: payload.title ?? 'Push Eagle',
          body: payload.body ?? '',
          icon: payload.iconUrl ?? '',
          image: payload.imageUrl ?? '',
          url: trackedTargetUrl ?? payload.targetUrl ?? '',
          button1Url: automationButton1Url ?? '',
          button2Url: automationButton2Url ?? '',
          trackPrimaryUrl: primaryTrackUrl,
          trackButton1Url: button1TrackUrl,
          trackButton2Url: button2TrackUrl,
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

    const { insertAutomationDelivery, extractAutomationDeliveryMeta } = await import(
      '@/lib/server/integrations/deliveries-data'
    );
    const deliveryMeta = extractAutomationDeliveryMeta(payload as Record<string, unknown>);

    await insertAutomationDelivery({
      automationJobId: claim.id,
      ruleKey: String(payload.ruleKey ?? claim.rule_key),
      shopDomain: claim.shop_domain,
      subscriberId: claim.subscriber_id ?? null,
      tokenId: deliveryTokenId,
      externalId: payload.externalId == null ? null : String(payload.externalId),
      targetUrl: payload.targetUrl == null ? null : String(payload.targetUrl),
      fcmMessageId: fcmMessageId,
      userAgent: activeTokenRow?.user_agent ? String(activeTokenRow.user_agent) : null,
      ipAddress: null,
      stepKey: deliveryMeta.stepKey,
      cartToken: deliveryMeta.cartToken,
    });

    await incrementBillingImpressions(claim.shop_domain, 1);

    return { processed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send automation message.';
    const isImpressionLimit = message.includes('Monthly impression limit reached');

    if (isImpressionLimit) {
      await sql`
        UPDATE automation_jobs
        SET status = 'skipped', error_message = ${message}, updated_at = NOW(), queue_enqueued_at = NULL
        WHERE id = ${jobId}
      `;
      return { processed: false, error: message };
    }

    const retryMinutes = claim.rule_key === 'welcome_subscriber'
      ? 0.25
      : claim.rule_key === 'cart_abandonment_30m'
        ? 2
        : 5;
    const maxSendAttempts = claim.rule_key === 'cart_abandonment_30m' ? 8 : 5;
    const shouldFail = Number(claim.attempts ?? 0) >= maxSendAttempts;
    const deferredDueAt = shouldFail ? null : new Date(Date.now() + retryMinutes * 60_000);

    await sql`
      UPDATE automation_jobs
      SET status = CASE WHEN attempts >= ${maxSendAttempts} THEN 'failed' ELSE 'pending' END,
          error_message = ${message},
          due_at = CASE WHEN attempts >= ${maxSendAttempts} THEN due_at ELSE ${deferredDueAt} END,
          queue_enqueued_at = NULL,
          updated_at = NOW()
      WHERE id = ${jobId}
    `;

    if (deferredDueAt) {
      await rescheduleAutomationJobAfterDefer(jobId, deferredDueAt);
    }

    return { processed: false, error: message };
  }
};

export const recordSubscriberActivity = async (input: {
  shopDomain: string;
  externalId: string;
  eventType: 'page_view' | 'product_view' | 'add_to_cart' | 'checkout_start' | 'checkout_complete';
  pageUrl?: string | null;
  productId?: string | null;
  cartToken?: string | null;
  metadata?: Record<string, unknown> | null;
  skipActivityPersist?: boolean;
}) => {
  if (input.eventType === 'page_view') {
    return { eventId: null, skipped: true };
  }

  // Raw-event collection gate: only collect/store/process an abandonment trigger
  // event when the automation that consumes it is active for this shop. When the
  // automation is off (merchant disabled it, or it is locked to a paid plan and
  // inactive), we do nothing at all — this honours the merchant's choice AND
  // removes the single biggest source of Neon load (carts/update fires on every
  // cart change for every visitor). checkout_complete and other non-trigger types
  // always pass through so conversion attribution keeps working.
  {
    const { shouldCollectEventType } = await import('@/lib/server/automation/collection-gate');
    if (!(await shouldCollectEventType(input.shopDomain, input.eventType))) {
      return { eventId: null, skipped: true, reason: 'automation_inactive' as const };
    }
  }

  await ensureSchema();
  const sql = getNeonSql();
  const triggeredAt = new Date().toISOString();

  await ensureAutomationRules(input.shopDomain);

  const eventId = randomUUID();

  // Consent-first persistence: the raw activity event is written ONLY once we've
  // confirmed it maps to a consented subscriber (an active push token). We never
  // store raw events for anonymous / non-subscribed visitors. Each trigger block
  // below calls persistRawEvent() when — and only when — a target is found; it is
  // idempotent so it writes at most once per call. The raw event exists purely to
  // drive the automation, so if there is no consented target there is nothing to
  // store.
  let rawPersisted = false;
  const persistRawEvent = async () => {
    if (rawPersisted || input.skipActivityPersist) {
      return;
    }
    rawPersisted = true;

    const { insertD1ActivityEvent, isD1EventsEnabled } = await import('@/lib/server/integrations/d1-events');
    if (isD1EventsEnabled()) {
      try {
        await insertD1ActivityEvent({
          id: eventId,
          shopDomain: input.shopDomain,
          externalId: input.externalId,
          eventType: input.eventType,
          pageUrl: input.pageUrl,
          productId: input.productId,
          cartToken: input.cartToken,
          metadata: input.metadata,
        });
        return;
      } catch (error) {
        console.error('[d1-events] activity write failed, falling back to Neon', error);
      }
    }

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
  };

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

    await persistRawEvent();

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

      if (targets.length > 0) {
        await persistRawEvent();
      }

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
      const clientId = normalizeClientId(input.metadata);

      // Always persist add_to_cart while cart recovery is active so product-order
      // tracking and identity stitching never miss a cart signal.
      await persistRawEvent();

      let targets = await listAutomationTargets({ shopDomain: input.shopDomain, externalId: input.externalId });

      if (targets.length === 0) {
        const externalIdCandidates = await resolveAutomationExternalIds({
          shopDomain: input.shopDomain,
          externalId: input.externalId,
          cartToken: input.cartToken,
          clientId,
        });

        if (externalIdCandidates.length > 0) {
          targets = await listAutomationTargetsByExternalIds(input.shopDomain, externalIdCandidates);
        }
      }

      if (targets.length === 0 && clientId) {
        targets = await listAutomationTargetsByClientId(input.shopDomain, clientId);
      }

      const { listCartProductsInAddOrder } = await import('@/lib/server/automation/cart-abandonment-products');
      const cartProductIds = await listCartProductsInAddOrder({
        shopDomain: input.shopDomain,
        cartToken: input.cartToken,
        externalId: input.externalId,
        currentProductId: input.productId,
      });

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
              cartProductIds,
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
    await persistRawEvent();
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

  if (input.eventType === 'checkout_complete') {
    await persistRawEvent();
    await cancelPendingCartReminderJobs({
      shopDomain: input.shopDomain,
      externalId: input.externalId,
      cartToken: input.cartToken,
    });
  }

  return { eventId };
};

export const upsertMerchantProfile = async (input: UpsertMerchantProfileInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  const offlineToken = input.shopifyOfflineAccessToken?.trim() || null;
  const hasOfflineToken = Boolean(offlineToken);

  await sql`
    UPDATE merchants
    SET
      shop_id = COALESCE(${input.shopId ?? null}, shop_id),
      store_name = COALESCE(${input.storeName ?? null}, store_name),
      email = COALESCE(${input.email ?? null}, email),
      primary_domain = COALESCE(${input.primaryDomain ?? null}, primary_domain),
      myshopify_domain = COALESCE(${input.myshopifyDomain ?? null}, myshopify_domain),
      currency_code = COALESCE(currency_code, ${input.currencyCode ?? null}),
      timezone = COALESCE(${input.timezone ?? null}, timezone),
      plan_name = COALESCE(${input.planName ?? null}, plan_name),
      owner_name = COALESCE(${input.ownerName ?? null}, owner_name),
      scopes = COALESCE(${input.scopes ?? null}, scopes),
      shopify_offline_access_token = CASE
        WHEN ${hasOfflineToken} THEN ${offlineToken}
        ELSE shopify_offline_access_token
      END,
      shopify_session_synced_at = CASE
        WHEN ${hasOfflineToken} THEN NOW()
        ELSE shopify_session_synced_at
      END,
      last_authenticated_at = CASE
        WHEN ${hasOfflineToken} THEN NOW()
        ELSE last_authenticated_at
      END,
      updated_at = NOW()
    WHERE shop_domain = ${input.shopDomain}
  `;

  const { invalidateMerchantStorefrontHostsCache } = await import('@/lib/server/storefront-merchant-hosts-cache');
  void invalidateMerchantStorefrontHostsCache(input.shopDomain);

  try {
    const { clearStorefrontConfigCache } = await import('@/lib/server/cache/storefront-config-cache');
    void clearStorefrontConfigCache(input.shopDomain);
  } catch {
    // best-effort cache invalidation
  }
};

export const upsertShopifyCustomer = async (input: UpsertShopifyCustomerInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  if (!input.customerId && !input.email) {
    return;
  }

  const tagsBlob = input.tags && input.tags.length > 0 ? input.tags.join(',') : null;

  const { isD1CustomersEnabled, d1UpsertCustomer } = await import(
    '@/lib/server/integrations/d1-customers'
  );
  if (isD1CustomersEnabled()) {
    await d1UpsertCustomer({
      shopDomain: input.shopDomain,
      customerId: input.customerId ?? null,
      externalId: input.externalId ?? null,
      email: input.email ?? null,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      tags: tagsBlob,
    });
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
        ${tagsBlob},
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
      ${tagsBlob},
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

const segmentDateFilterActive = (condition?: SegmentCondition) =>
  (condition?.dateOperator ?? 'at any time') !== 'at any time';

const aggregateTimedEventsForCondition = (
  events: Array<{ subscriberId: number; at: Date }>,
  condition: SegmentCondition,
) => {
  const counts = new Map<number, number>();
  const filterByDate = segmentDateFilterActive(condition);

  for (const event of events) {
    if (filterByDate && !applyDateOperator(event.at, condition)) {
      continue;
    }
    counts.set(event.subscriberId, (counts.get(event.subscriberId) ?? 0) + 1);
  }

  const matched = new Set<number>();
  counts.forEach((total, subscriberId) => {
    if (applyCountOperator(total, condition)) {
      matched.add(subscriberId);
    }
  });
  return matched;
};

const matchSubscribersFromStatRows = (
  rows: Array<{ subscriber_id: number; total: number; last_at: string | null }>,
  condition: SegmentCondition,
) => {
  const matched = new Set<number>();
  for (const row of rows) {
    const subscriberId = Number(row.subscriber_id);
    const total = Number(row.total ?? 0);
    const lastAt = toDate(row.last_at ? String(row.last_at) : null);
    if (!applyCountOperator(total, condition)) {
      continue;
    }
    if (segmentDateFilterActive(condition) && !applyDateOperator(lastAt, condition)) {
      continue;
    }
    matched.add(subscriberId);
  }
  return matched;
};

const loadExternalIdToSubscriberMap = async (shopDomain: string) => {
  const { audienceRead, d1GetSubscriberIdExternalIdPairs } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  const sql = getNeonSql();
  const pairs = await audienceRead<Array<{ id: number; external_id: string | null }>>({
    label: 'segment.externalIdMap',
    key: (arr) => arr.map((row) => `${Number(row.id)}:${row.external_id || ''}`).sort().join(','),
    neon: async () => {
      const rows = await sql`
        SELECT id, external_id
        FROM subscribers
        WHERE shop_domain = ${shopDomain}
          AND external_id IS NOT NULL
      `;
      return (rows as Array<Record<string, unknown>>).map((row) => ({
        id: Number(row.id),
        external_id: row.external_id == null ? null : String(row.external_id),
      }));
    },
    d1: async () => d1GetSubscriberIdExternalIdPairs(shopDomain),
  });
  return new Map(
    pairs
      .filter((pair) => pair.external_id)
      .map((pair) => [String(pair.external_id), Number(pair.id)]),
  );
};

const buildCriteriaSummary = (conditionGroups: SegmentConditionGroup[]) => {
  const first = conditionGroups[0]?.conditions[0];
  if (!first) {
    return 'Custom audience criteria';
  }

  const parts: string[] = [first.type];
  if (first.type === 'Custom attribute' && first.attributeName) {
    parts.push(String(first.attributeName));
  } else if (first.textValue) {
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
  const { audienceRead, d1ListAllSubscriberIds } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  const ids = await audienceRead<number[]>({
    label: 'segment.listAllSubscriberIds',
    key: (arr) => [...arr].sort((a, b) => a - b).join(','),
    neon: async () => {
      const rows = await sql`
        SELECT id
        FROM subscribers
        WHERE shop_domain = ${shopDomain}
      `;
      return rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id));
    },
    d1: async () => d1ListAllSubscriberIds(shopDomain),
  });
  return new Set(ids);
};

const queryConditionSubscriberIds = async (shopDomain: string, condition: SegmentCondition, allIds: Set<number>) => {
  const sql = getNeonSql();
  const textFilter = String(condition.textValue || '').trim();

  let matched = new Set<number>();

  if (condition.type === 'Clicked') {
    const { isD1DeliveriesEnabled, d1GetClickedSubscriberStats, d1ListClickEvents } = await import(
      '@/lib/server/integrations/d1-deliveries'
    );
    const externalMap = await loadExternalIdToSubscriberMap(shopDomain);

    if (segmentDateFilterActive(condition)) {
      const clickEvents = isD1DeliveriesEnabled()
        ? (await d1ListClickEvents(shopDomain, externalMap)).map((row) => ({
            subscriberId: Number(row.subscriber_id),
            at: toDate(row.clicked_at) as Date,
          }))
        : (
            (await sql`
              SELECT subscriber_id, clicked_at
              FROM campaign_clicks
              WHERE shop_domain = ${shopDomain} AND subscriber_id IS NOT NULL
              UNION ALL
              SELECT subscriber_id, clicked_at
              FROM automation_clicks
              WHERE shop_domain = ${shopDomain} AND subscriber_id IS NOT NULL
            `) as Array<{ subscriber_id: number; clicked_at: string }>
          ).map((row) => ({
            subscriberId: Number(row.subscriber_id),
            at: toDate(String(row.clicked_at)) as Date,
          }));

      matched = aggregateTimedEventsForCondition(
        clickEvents.filter((event) => event.at != null),
        condition,
      );
    } else {
      const clickRows = isD1DeliveriesEnabled()
        ? await d1GetClickedSubscriberStats(shopDomain, externalMap)
        : ((await sql`
            SELECT subscriber_id, COUNT(*)::INT AS total, MAX(clicked_at) AS last_at
            FROM (
              SELECT subscriber_id, clicked_at
              FROM campaign_clicks
              WHERE shop_domain = ${shopDomain} AND subscriber_id IS NOT NULL
              UNION ALL
              SELECT subscriber_id, clicked_at
              FROM automation_clicks
              WHERE shop_domain = ${shopDomain} AND subscriber_id IS NOT NULL
            ) combined
            GROUP BY subscriber_id
          `) as Array<{ subscriber_id: number; total: number; last_at: string | null }>);

      matched = matchSubscribersFromStatRows(clickRows, condition);
    }
  } else if (condition.type === 'Purchased') {
    const { isD1CommerceEnabled, d1GetPurchasedSubscriberStats, d1ListPurchaseEvents } = await import(
      '@/lib/server/integrations/d1-commerce'
    );

    if (segmentDateFilterActive(condition)) {
      const purchaseEvents = isD1CommerceEnabled()
        ? (await d1ListPurchaseEvents(shopDomain)).map((row) => ({
            subscriberId: Number(row.subscriber_id),
            at: toDate(row.created_at) as Date,
          }))
        : (
            (await sql`
              SELECT subscriber_id, created_at
              FROM shopify_orders
              WHERE shop_domain = ${shopDomain}
                AND subscriber_id IS NOT NULL
            `) as Array<{ subscriber_id: number; created_at: string }>
          ).map((row) => ({
            subscriberId: Number(row.subscriber_id),
            at: toDate(String(row.created_at)) as Date,
          }));

      matched = aggregateTimedEventsForCondition(
        purchaseEvents.filter((event) => event.at != null),
        condition,
      );
    } else {
      const rows = isD1CommerceEnabled()
        ? await d1GetPurchasedSubscriberStats(shopDomain)
        : await sql`
            SELECT subscriber_id, COUNT(*)::INT AS total, MAX(created_at) AS last_at
            FROM shopify_orders
            WHERE shop_domain = ${shopDomain}
              AND subscriber_id IS NOT NULL
            GROUP BY subscriber_id
          `;

      matched = matchSubscribersFromStatRows(
        rows as Array<{ subscriber_id: number; total: number; last_at: string | null }>,
        condition,
      );
    }
  } else if (condition.type === 'Purchased a product' || condition.type === 'Purchased from collection') {
    if (!textFilter) {
      matched = new Set<number>();
    } else {
      const { isD1CommerceEnabled, d1GetProductPurchaseStats, d1ListProductPurchaseEvents } =
        await import('@/lib/server/integrations/d1-commerce');
      const productOptions = {
        byCollection: condition.type === 'Purchased from collection',
        textFilter,
      };

      if (segmentDateFilterActive(condition)) {
        const purchaseEvents = isD1CommerceEnabled()
          ? (await d1ListProductPurchaseEvents(shopDomain, productOptions)).map((row) => ({
              subscriberId: Number(row.subscriber_id),
              at: toDate(row.created_at) as Date,
            }))
          : (
              (await sql`
                SELECT o.subscriber_id, o.created_at
                FROM shopify_order_items i
                JOIN shopify_orders o ON o.id = i.order_event_id
                WHERE o.shop_domain = ${shopDomain}
                  AND o.subscriber_id IS NOT NULL
                  AND (
                    ${condition.type === 'Purchased from collection'} = true
                      AND i.collection_hint ILIKE ${`%${textFilter}%`}
                    OR ${condition.type === 'Purchased a product'} = true
                      AND i.product_title ILIKE ${`%${textFilter}%`}
                  )
              `) as Array<{ subscriber_id: number; created_at: string }>
            ).map((row) => ({
              subscriberId: Number(row.subscriber_id),
              at: toDate(String(row.created_at)) as Date,
            }));

        matched = aggregateTimedEventsForCondition(
          purchaseEvents.filter((event) => event.at != null),
          condition,
        );
      } else {
        const rows = isD1CommerceEnabled()
          ? await d1GetProductPurchaseStats(shopDomain, productOptions)
          : await sql`
              SELECT o.subscriber_id, COUNT(*)::INT AS total, MAX(o.created_at) AS last_at
              FROM shopify_order_items i
              JOIN shopify_orders o ON o.id = i.order_event_id
              WHERE o.shop_domain = ${shopDomain}
                AND o.subscriber_id IS NOT NULL
                AND (
                  ${condition.type === 'Purchased from collection'} = true
                    AND i.collection_hint ILIKE ${`%${textFilter}%`}
                  OR ${condition.type === 'Purchased a product'} = true
                    AND i.product_title ILIKE ${`%${textFilter}%`}
                )
              GROUP BY o.subscriber_id
            `;

        matched = matchSubscribersFromStatRows(
          rows as Array<{ subscriber_id: number; total: number; last_at: string | null }>,
          condition,
        );
      }
    }
  } else if (condition.type === 'Subscribed') {
    const { audienceRead, d1GetSubscribedRows } = await import(
      '@/lib/server/integrations/d1-audience'
    );
    const rows = await audienceRead<Array<{ id: number; created_at: string | null }>>({
      label: 'segment.subscribed',
      key: (arr) =>
        arr
          .map((r) => `${Number(r.id)}:${r.created_at ? new Date(String(r.created_at)).getTime() : 0}`)
          .sort()
          .join(','),
      neon: async () => {
        const r = await sql`
          SELECT id, created_at
          FROM subscribers
          WHERE shop_domain = ${shopDomain}
        `;
        return (r as Array<Record<string, unknown>>).map((row) => ({
          id: Number(row.id),
          created_at: row.created_at == null ? null : String(row.created_at),
        }));
      },
      d1: async () => d1GetSubscribedRows(shopDomain),
    });

    for (const row of rows) {
      const subscriberId = Number(row.id);
      const createdAt = toDate(row.created_at ? String(row.created_at) : null);
      if (applyDateOperator(createdAt, condition)) {
        matched.add(subscriberId);
      }
    }
  } else if (
    condition.type === 'Location' ||
    condition.type === 'Country' ||
    condition.type === 'City' ||
    condition.type === 'Region'
  ) {
    const selected = Array.isArray(condition.selectedValues) ? condition.selectedValues : [];
    let countries: string[] = [];
    let cities: string[] = [];
    let regions: string[] = [];

    if (condition.type === 'Location') {
      countries = selected.filter((value) => value.type === 'country').map((value) => String(value.value).toLowerCase());
      cities = selected.filter((value) => value.type === 'city').map((value) => String(value.value).toLowerCase());
      regions = selected.filter((value) => value.type === 'region').map((value) => String(value.value).toLowerCase());
    } else if (condition.type === 'Country') {
      countries = selected.map((value) => String(value.value).toLowerCase());
    } else if (condition.type === 'City') {
      cities = selected.map((value) => String(value.value).toLowerCase());
    } else if (condition.type === 'Region') {
      regions = selected.map((value) => String(value.value).toLowerCase());
    }

    if (countries.length === 0 && cities.length === 0 && regions.length === 0) {
      matched = new Set<number>();
    } else {
    const { audienceRead, d1GetLocationRows } = await import(
      '@/lib/server/integrations/d1-audience'
    );
    const rows = await audienceRead<
      Array<{ id: number; country: string | null; city: string | null; region: string | null }>
    >({
      label: 'segment.location',
      key: (arr) =>
        arr
          .map(
            (r) =>
              `${Number(r.id)}|${(r.country || '').toLowerCase()}|${(r.city || '').toLowerCase()}|${(r.region || '').toLowerCase()}`,
          )
          .sort()
          .join(','),
      neon: async () => {
        const r = await sql`
          SELECT id, country, city, device_context ->> 'region' AS region
          FROM subscribers
          WHERE shop_domain = ${shopDomain}
        `;
        return (r as Array<Record<string, unknown>>).map((row) => ({
          id: Number(row.id),
          country: row.country == null ? null : String(row.country),
          city: row.city == null ? null : String(row.city),
          region: row.region == null ? null : String(row.region),
        }));
      },
      d1: async () => d1GetLocationRows(shopDomain),
    });

    for (const row of rows) {
      const subscriberId = Number(row.id);
      const country = String(row.country || '').toLowerCase();
      const city = String(row.city || '').toLowerCase();
      const region = String(row.region || '').toLowerCase();

      const countryMatch = countries.length === 0 || countries.includes(country);
      const cityMatch = cities.length === 0 || cities.includes(city);
      const regionMatch = regions.length === 0 || regions.includes(region);

      if (countryMatch && cityMatch && regionMatch) {
        matched.add(subscriberId);
      }
    }
    }
  } else if (condition.type === 'Customer tag') {
    const selectedTags = Array.isArray(condition.selectedValues)
      ? condition.selectedValues.map((value) => String(value.value ?? value.label ?? '').trim()).filter(Boolean)
      : [];
    const tags = selectedTags.length > 0 ? selectedTags : (textFilter ? [textFilter] : []);

    if (tags.length === 0) {
      matched = new Set<number>();
    } else {
      const { isD1CustomersEnabled, d1GetCustomerTagsMap } = await import(
        '@/lib/server/integrations/d1-customers'
      );

      const matchTags = (subscriberId: number, tagsValue: string) => {
        const tagBlob = tagsValue.toLowerCase();
        const tagList = tagBlob.split(',').map((tag) => tag.trim()).filter(Boolean);
        const hasTag = tags.some(
          (tag) => tagList.includes(tag.toLowerCase()) || tagBlob.includes(tag.toLowerCase()),
        );
        if (hasTag) {
          matched.add(subscriberId);
        }
      };

      if (isD1CustomersEnabled()) {
        // Reproduce the subscribers<->customers join in app code: subscriber
        // (id, external_id) pairs live on Neon (or D1), tags live in D1.
        const { audienceRead, d1GetSubscriberIdExternalIdPairs } = await import(
          '@/lib/server/integrations/d1-audience'
        );
        const [subscriberRows, tagByExternalId] = await Promise.all([
          audienceRead<Array<{ id: number; external_id: string | null }>>({
            label: 'segment.customerTag.subscriberPairs',
            key: (arr) => arr.map((r) => `${Number(r.id)}:${r.external_id || ''}`).sort().join(','),
            neon: async () => {
              const r = await sql`
                SELECT id, external_id
                FROM subscribers
                WHERE shop_domain = ${shopDomain}
                  AND external_id IS NOT NULL
              `;
              return (r as Array<Record<string, unknown>>).map((row) => ({
                id: Number(row.id),
                external_id: row.external_id == null ? null : String(row.external_id),
              }));
            },
            d1: async () => d1GetSubscriberIdExternalIdPairs(shopDomain),
          }),
          d1GetCustomerTagsMap(shopDomain),
        ]);

        for (const row of subscriberRows) {
          const tagsValue = tagByExternalId.get(String(row.external_id ?? ''));
          if (tagsValue) {
            matchTags(Number(row.id), tagsValue);
          }
        }
      } else {
        const rows = await sql`
          SELECT s.id, c.tags
          FROM subscribers s
          JOIN shopify_customers c
            ON c.shop_domain = s.shop_domain
           AND c.external_id = s.external_id
          WHERE s.shop_domain = ${shopDomain}
            AND c.tags IS NOT NULL
            AND c.tags <> ''
        `;

        for (const row of rows) {
          matchTags(Number(row.id), String(row.tags ?? ''));
        }
      }
    }
  } else if (condition.type === 'Custom attribute') {
    const { queryCustomAttributeSubscriberIds } = await import('@/lib/server/segment-custom-attributes');
    matched = await queryCustomAttributeSubscriberIds(shopDomain, {
      operator: condition.operator === 'is not' ? 'is not' : 'is',
      attributeName: condition.attributeName,
      textValue: condition.textValue,
      selectedValues: condition.selectedValues,
    });
  }

  const operator = condition.operator ?? (['Location', 'Country', 'City', 'Region', 'Customer tag', 'Custom attribute'].includes(condition.type) ? 'is' : 'has');
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

  const subscriberId = input.externalId
    ? await (async () => {
        const { audienceRead, d1GetSubscriberIdByExternalId } = await import(
          '@/lib/server/integrations/d1-audience'
        );
        return audienceRead<number | null>({
          label: 'upsertShopifyOrderEvent.subscriberId',
          key: (v) => String(v ?? 'null'),
          neon: async () => {
            const rows = await sql`
              SELECT id
              FROM subscribers
              WHERE shop_domain = ${input.shopDomain}
                AND external_id = ${input.externalId}
              LIMIT 1
            `;
            return rows[0]?.id ? Number(rows[0].id) : null;
          },
          d1: async () =>
            d1GetSubscriberIdByExternalId(input.shopDomain, String(input.externalId)),
        });
      })()
    : null;
  const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();

  const { isD1CommerceEnabled, d1UpsertOrderEvent } = await import(
    '@/lib/server/integrations/d1-commerce'
  );

  if (isD1CommerceEnabled()) {
    // Authoritative write to D1. order_items are replaced inside d1UpsertOrderEvent.
    await d1UpsertOrderEvent({
      shopDomain: input.shopDomain,
      orderId: input.orderId,
      externalId: input.externalId ?? null,
      customerId: input.customerId ?? null,
      email: input.email ?? null,
      subscriberId,
      totalPriceCents: input.totalPriceCents,
      createdAt,
      lineItems: (input.lineItems ?? []).map((item) => ({
        productId: item.productId ?? null,
        productTitle: item.productTitle ?? null,
        collectionHint: item.collectionHint ?? null,
      })),
    });
  } else {
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

  const { isD1CatalogEnabled, d1GetExistingVariants, d1UpsertVariant } = await import(
    '@/lib/server/integrations/d1-catalog'
  );
  const useD1Catalog = isD1CatalogEnabled();

  const variantIds = input.variants.map((variant) => variant.variantId);

  // Shared shape ({ priceCents, compareAtPriceCents, available }) regardless of
  // backing store so the price-drop detection below is identical either way.
  type ExistingVariantInfo = {
    priceCents: number | null;
    compareAtPriceCents: number | null;
    available: number | null;
  };
  const existingByVariantId: Map<string, ExistingVariantInfo> = useD1Catalog
    ? await d1GetExistingVariants(input.shopDomain, variantIds)
    : new Map(
        ((variantIds.length
          ? await sql`
            SELECT variant_id, price_cents, compare_at_price_cents, available
            FROM shopify_product_variants
            WHERE shop_domain = ${input.shopDomain}
              AND variant_id = ANY(${variantIds})
          `
          : []) as Array<Record<string, unknown>>
        ).map((row) => [String(row.variant_id), {
          priceCents: row.price_cents == null ? null : Number(row.price_cents),
          compareAtPriceCents: row.compare_at_price_cents == null ? null : Number(row.compare_at_price_cents),
          available: row.available == null ? null : Number(row.available),
        }] as [string, ExistingVariantInfo]),
      );

  const updatedAt = input.updatedAt ? new Date(input.updatedAt) : new Date();
  const nowIso = new Date().toISOString();
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

    if (useD1Catalog) {
      await d1UpsertVariant({
        shopDomain: input.shopDomain,
        productId: input.productId,
        variantId: variant.variantId,
        inventoryItemId: variant.inventoryItemId ?? null,
        productTitle: input.productTitle ?? null,
        variantTitle: variant.variantTitle ?? null,
        handle: input.handle ?? null,
        imageUrl: input.imageUrl ?? null,
        priceCents: variant.priceCents ?? null,
        compareAtPriceCents: variant.compareAtPriceCents ?? null,
        available: existing?.available ?? null,
        updatedAtIso: updatedAt.toISOString(),
        lastSeenAtIso: nowIso,
      });
      continue;
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

  const {
    isD1CatalogEnabled,
    d1GetVariantsByInventoryItem,
    d1UpdateVariantAvailabilityByInventoryItem,
  } = await import('@/lib/server/integrations/d1-catalog');
  const useD1Catalog = isD1CatalogEnabled();

  const variantRows = useD1Catalog
    ? await d1GetVariantsByInventoryItem(input.shopDomain, input.inventoryItemId)
    : ((
        await sql`
          SELECT variant_id, product_id, product_title, handle, available
          FROM shopify_product_variants
          WHERE shop_domain = ${input.shopDomain}
            AND inventory_item_id = ${input.inventoryItemId}
        `
      ) as Array<Record<string, unknown>>).map((row) => ({
        variantId: String(row.variant_id),
        productId: String(row.product_id),
        productTitle: row.product_title ? String(row.product_title) : null,
        handle: row.handle ? String(row.handle) : null,
        available: row.available == null ? null : Number(row.available),
      }));

  if (variantRows.length === 0) {
    return;
  }

  const updatedAt = input.updatedAt ? new Date(input.updatedAt) : new Date();
  const backInStockCandidates = [] as Array<{ productId: string; variantId: string; productTitle: string | null; handle: string | null }>;

  for (const row of variantRows) {
    const previousAvailable = row.available == null ? null : Number(row.available);
    if ((previousAvailable == null || previousAvailable <= 0) && (input.available ?? 0) > 0) {
      backInStockCandidates.push({
        productId: row.productId,
        variantId: row.variantId,
        productTitle: row.productTitle,
        handle: row.handle,
      });
    }
  }

  if (useD1Catalog) {
    await d1UpdateVariantAvailabilityByInventoryItem({
      shopDomain: input.shopDomain,
      inventoryItemId: input.inventoryItemId,
      available: input.available ?? null,
      updatedAtIso: updatedAt.toISOString(),
      lastSeenAtIso: new Date().toISOString(),
    });
  } else {
    await sql`
      UPDATE shopify_product_variants
      SET available = ${input.available}, updated_at = ${updatedAt}, last_seen_at = NOW()
      WHERE shop_domain = ${input.shopDomain}
        AND inventory_item_id = ${input.inventoryItemId}
    `;
  }

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

  const { isD1CommerceEnabled, d1UpsertFulfillment, d1GetOrderIdentityByOrderId } = await import(
    '@/lib/server/integrations/d1-commerce'
  );
  const commerceOnD1 = isD1CommerceEnabled();

  if (commerceOnD1) {
    await d1UpsertFulfillment({
      shopDomain: input.shopDomain,
      fulfillmentId: input.fulfillmentId,
      orderId: input.orderId,
      status: input.status ?? null,
      shipmentStatus: input.shipmentStatus ?? null,
      trackingCompany: input.trackingCompany ?? null,
      trackingNumbers: input.trackingNumbers ?? [],
      trackingUrls: input.trackingUrls ?? [],
      updatedAt,
    });
  } else {
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
  }

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

  const orderRow = commerceOnD1
    ? await d1GetOrderIdentityByOrderId(input.shopDomain, input.orderId)
    : (
        await sql`
          SELECT subscriber_id, external_id, customer_id
          FROM shopify_orders
          WHERE shop_domain = ${input.shopDomain}
            AND order_id = ${input.orderId}
          ORDER BY created_at DESC
          LIMIT 1
        `
      )[0];

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
  await sql`
    UPDATE segments
    SET
      estimated_subscriber_count = ${subscriberIds.size},
      estimated_count_at = NOW()
    WHERE id = ${resolvedSegmentId}
      AND shop_domain = ${input.shopDomain}
  `;

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

const SEGMENT_COUNT_STALE_MS = 60 * 60 * 1000;

export const refreshSegmentEstimatedCount = async (shopDomain: string, segmentId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const rows = await sql`
    SELECT condition_groups
    FROM segments
    WHERE id = ${segmentId}
      AND shop_domain = ${shopDomain}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    return 0;
  }

  const groups = parseConditionGroups(row.condition_groups);
  const subscriberIds = await resolveSubscriberIdsFromConditionGroups(shopDomain, groups);
  const count = subscriberIds.size;

  await sql`
    UPDATE segments
    SET
      estimated_subscriber_count = ${count},
      estimated_count_at = NOW()
    WHERE id = ${segmentId}
      AND shop_domain = ${shopDomain}
  `;

  return count;
};

export type ListSegmentsOptions = {
  preferCache?: boolean;
  staleAfterMs?: number;
};

export const listSegments = async (
  shopDomain: string,
  options?: ListSegmentsOptions,
): Promise<SegmentSummary[]> => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(shopDomain);

  const preferCache = Boolean(options?.preferCache);
  const staleAfterMs = options?.staleAfterMs ?? SEGMENT_COUNT_STALE_MS;

  const rows = await sql`
    SELECT id, name, condition_groups, created_at, estimated_subscriber_count, estimated_count_at
    FROM segments
    WHERE shop_domain = ${shopDomain}
    ORDER BY created_at DESC
  `;

  const result: SegmentSummary[] = [];
  for (const row of rows) {
    const groups = parseConditionGroups(row.condition_groups);
    const cachedCount =
      row.estimated_subscriber_count == null ? null : Number(row.estimated_subscriber_count);
    const countAgeMs = row.estimated_count_at
      ? Date.now() - new Date(String(row.estimated_count_at)).getTime()
      : Number.POSITIVE_INFINITY;
    const cacheIsFresh = cachedCount != null && Number.isFinite(countAgeMs) && countAgeMs <= staleAfterMs;

    let subscriberCount = cachedCount ?? 0;
    if (!preferCache && !cacheIsFresh) {
      subscriberCount = await refreshSegmentEstimatedCount(shopDomain, String(row.id));
    }

    result.push({
      id: String(row.id),
      name: String(row.name),
      type: 'Dynamic',
      subscriberCount,
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

  const { isD1CustomersEnabled, d1GetDistinctCustomerTags } = await import(
    '@/lib/server/integrations/d1-customers'
  );
  const {
    audienceRead,
    d1GetDistinctCountries,
    d1GetDistinctCities,
    d1GetDistinctRegions,
  } = await import('@/lib/server/integrations/d1-audience');
  const useD1Customers = isD1CustomersEnabled();

  const stringListKey = (arr: string[]) => arr.join('|');

  const [countries, cities, regions, neonTags] = await Promise.all([
    audienceRead<string[]>({
      label: 'segment.filterOptions.countries',
      key: stringListKey,
      neon: async () => {
        const rows = await sql`
          SELECT DISTINCT TRIM(country) AS value
          FROM subscribers
          WHERE shop_domain = ${shopDomain}
            AND country IS NOT NULL
            AND TRIM(country) <> ''
          ORDER BY value ASC
          LIMIT 300
        `;
        return (rows as Array<{ value: unknown }>).map((row) => String(row.value));
      },
      d1: async () => d1GetDistinctCountries(shopDomain, 300),
    }),
    audienceRead<string[]>({
      label: 'segment.filterOptions.cities',
      key: stringListKey,
      neon: async () => {
        const rows = await sql`
          SELECT DISTINCT TRIM(city) AS value
          FROM subscribers
          WHERE shop_domain = ${shopDomain}
            AND city IS NOT NULL
            AND TRIM(city) <> ''
          ORDER BY value ASC
          LIMIT 500
        `;
        return (rows as Array<{ value: unknown }>).map((row) => String(row.value));
      },
      d1: async () => d1GetDistinctCities(shopDomain, 500),
    }),
    audienceRead<string[]>({
      label: 'segment.filterOptions.regions',
      key: stringListKey,
      neon: async () => {
        const rows = await sql`
          SELECT DISTINCT TRIM(device_context ->> 'region') AS value
          FROM subscribers
          WHERE shop_domain = ${shopDomain}
            AND device_context IS NOT NULL
            AND TRIM(device_context ->> 'region') <> ''
          ORDER BY value ASC
          LIMIT 500
        `;
        return (rows as Array<{ value: unknown }>).map((row) => String(row.value));
      },
      d1: async () => d1GetDistinctRegions(shopDomain, 500),
    }),
    useD1Customers
      ? Promise.resolve([] as Array<{ value: string }>)
      : sql`
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

  const customerTags = useD1Customers
    ? await d1GetDistinctCustomerTags(shopDomain)
    : (neonTags as Array<{ value: unknown }>).map((row) => String(row.value));

  return {
    countries,
    cities,
    regions,
    customerTags,
  };
};

type CampaignRecipientRow = {
  token_id: string | number;
  fcm_token: string;
  token_type: string | null;
  vapid_endpoint: string | null;
  vapid_p256dh: string | null;
  vapid_auth: string | null;
  subscriber_id: string | number;
  external_id: string | null;
  platform: string | null;
  user_agent?: string | null;
};

export const resolveCampaignAudience = async (
  shopDomain: string,
  segmentId?: string | null,
  excludeDeliveredCampaignId?: string | null,
): Promise<CampaignRecipientRow[]> => {
  await ensureSchema();
  const sql = getNeonSql();

  const { audienceRead, d1ResolveCampaignRecipients } = await import(
    '@/lib/server/integrations/d1-audience'
  );

  // Canonical, order-independent signature for shadow-mode mismatch detection.
  const recipientKey = (rows: CampaignRecipientRow[]) =>
    rows
      .map((row) => `${Number(row.subscriber_id)}:${Number(row.token_id)}`)
      .sort()
      .join(',');

  // The delivery de-dup lives on Neon (campaign_deliveries). For the D1 path we
  // fetch the already-delivered subscriber ids and subtract in app code.
  const getDeliveredSubscriberIds = async (): Promise<Set<number>> => {
    if (!excludeDeliveredCampaignId) {
      return new Set<number>();
    }
    const { getDeliveredSubscriberIdsForCampaign } = await import(
      '@/lib/server/integrations/deliveries-data'
    );
    return new Set(await getDeliveredSubscriberIdsForCampaign(excludeDeliveredCampaignId, true));
  };

  const d1Recipients = async (subscriberIds?: number[]): Promise<CampaignRecipientRow[]> => {
    const [recipients, delivered] = await Promise.all([
      d1ResolveCampaignRecipients(shopDomain, subscriberIds),
      getDeliveredSubscriberIds(),
    ]);
    const filtered =
      delivered.size > 0
        ? recipients.filter((row) => !delivered.has(row.subscriber_id))
        : recipients;
    return filtered as unknown as CampaignRecipientRow[];
  };

  if (!segmentId || segmentId === 'all') {
    return audienceRead<CampaignRecipientRow[]>({
      label: 'resolveCampaignAudience.all',
      key: recipientKey,
      neon: async () => {
        const rows = excludeDeliveredCampaignId
          ? await sql`
            SELECT DISTINCT ON (s.id)
              t.id AS token_id,
              t.fcm_token,
              t.token_type,
              t.vapid_endpoint,
              t.vapid_p256dh,
              t.vapid_auth,
              s.id AS subscriber_id,
              s.external_id,
              s.platform,
              t.user_agent
            FROM subscribers s
            JOIN subscriber_tokens t ON t.subscriber_id = s.id
            WHERE s.shop_domain = ${shopDomain}
              AND t.shop_domain = ${shopDomain}
              AND t.status = 'active'
              AND (
                (
                  COALESCE(t.token_type, 'fcm') = 'vapid'
                  AND t.vapid_endpoint IS NOT NULL AND TRIM(t.vapid_endpoint) <> ''
                  AND t.vapid_p256dh IS NOT NULL AND TRIM(t.vapid_p256dh) <> ''
                  AND t.vapid_auth IS NOT NULL AND TRIM(t.vapid_auth) <> ''
                )
                OR (
                  COALESCE(t.token_type, 'fcm') <> 'vapid'
                  AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
                )
              )
              AND NOT EXISTS (
                SELECT 1
                FROM campaign_deliveries cd
                WHERE cd.campaign_id = ${excludeDeliveredCampaignId}
                  AND cd.subscriber_id = s.id
                  AND cd.fcm_message_id IS NOT NULL
              )
            ORDER BY s.id, t.last_seen_at DESC NULLS LAST, t.updated_at DESC, t.id DESC
          `
          : await sql`
            SELECT DISTINCT ON (s.id)
              t.id AS token_id,
              t.fcm_token,
              t.token_type,
              t.vapid_endpoint,
              t.vapid_p256dh,
              t.vapid_auth,
              s.id AS subscriber_id,
              s.external_id,
              s.platform,
              t.user_agent
            FROM subscribers s
            JOIN subscriber_tokens t ON t.subscriber_id = s.id
            WHERE s.shop_domain = ${shopDomain}
              AND t.shop_domain = ${shopDomain}
              AND t.status = 'active'
              AND (
                (
                  COALESCE(t.token_type, 'fcm') = 'vapid'
                  AND t.vapid_endpoint IS NOT NULL AND TRIM(t.vapid_endpoint) <> ''
                  AND t.vapid_p256dh IS NOT NULL AND TRIM(t.vapid_p256dh) <> ''
                  AND t.vapid_auth IS NOT NULL AND TRIM(t.vapid_auth) <> ''
                )
                OR (
                  COALESCE(t.token_type, 'fcm') <> 'vapid'
                  AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
                )
              )
            ORDER BY s.id, t.last_seen_at DESC NULLS LAST, t.updated_at DESC, t.id DESC
          `;
        return rows as unknown as CampaignRecipientRow[];
      },
      d1: async () => d1Recipients(undefined),
    });
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

  const subscriberIds = Array.from(allowedIds);

  return audienceRead<CampaignRecipientRow[]>({
    label: 'resolveCampaignAudience.segment',
    key: recipientKey,
    neon: async () => {
      const rows = excludeDeliveredCampaignId
        ? await sql`
          SELECT DISTINCT ON (s.id)
            t.id AS token_id,
            t.fcm_token,
            t.token_type,
            t.vapid_endpoint,
            t.vapid_p256dh,
            t.vapid_auth,
            s.id AS subscriber_id,
            s.external_id,
            s.platform,
            t.user_agent
          FROM subscribers s
          JOIN subscriber_tokens t ON t.subscriber_id = s.id
          WHERE s.shop_domain = ${shopDomain}
            AND t.shop_domain = ${shopDomain}
            AND t.status = 'active'
            AND (
              (
                COALESCE(t.token_type, 'fcm') = 'vapid'
                AND t.vapid_endpoint IS NOT NULL AND TRIM(t.vapid_endpoint) <> ''
                AND t.vapid_p256dh IS NOT NULL AND TRIM(t.vapid_p256dh) <> ''
                AND t.vapid_auth IS NOT NULL AND TRIM(t.vapid_auth) <> ''
              )
              OR (
                COALESCE(t.token_type, 'fcm') <> 'vapid'
                AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
              )
            )
            AND s.id = ANY(${subscriberIds})
            AND NOT EXISTS (
              SELECT 1
              FROM campaign_deliveries cd
              WHERE cd.campaign_id = ${excludeDeliveredCampaignId}
                AND cd.subscriber_id = s.id
                AND cd.fcm_message_id IS NOT NULL
            )
          ORDER BY s.id, t.last_seen_at DESC NULLS LAST, t.updated_at DESC, t.id DESC
        `
        : await sql`
          SELECT DISTINCT ON (s.id)
            t.id AS token_id,
            t.fcm_token,
            t.token_type,
            t.vapid_endpoint,
            t.vapid_p256dh,
            t.vapid_auth,
            s.id AS subscriber_id,
            s.external_id,
            s.platform,
            t.user_agent
          FROM subscribers s
          JOIN subscriber_tokens t ON t.subscriber_id = s.id
          WHERE s.shop_domain = ${shopDomain}
            AND t.shop_domain = ${shopDomain}
            AND t.status = 'active'
            AND (
              (
                COALESCE(t.token_type, 'fcm') = 'vapid'
                AND t.vapid_endpoint IS NOT NULL AND TRIM(t.vapid_endpoint) <> ''
                AND t.vapid_p256dh IS NOT NULL AND TRIM(t.vapid_p256dh) <> ''
                AND t.vapid_auth IS NOT NULL AND TRIM(t.vapid_auth) <> ''
              )
              OR (
                COALESCE(t.token_type, 'fcm') <> 'vapid'
                AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
              )
            )
            AND s.id = ANY(${subscriberIds})
          ORDER BY s.id, t.last_seen_at DESC NULLS LAST, t.updated_at DESC, t.id DESC
        `;
      return rows as unknown as CampaignRecipientRow[];
    },
    d1: async () => d1Recipients(subscriberIds),
  });
};

const dedupeRecipientsBySubscriber = (rows: CampaignRecipientRow[]) => {
  const bySubscriber = new Map<number, CampaignRecipientRow>();

  for (const row of rows) {
    const subscriberId = Number(row.subscriber_id);
    if (!Number.isFinite(subscriberId)) {
      continue;
    }

    if (!bySubscriber.has(subscriberId)) {
      bySubscriber.set(subscriberId, row);
    }
  }

  return Array.from(bySubscriber.values());
};

export const countCampaignAudienceTokens = async (shopDomain: string, segmentId?: string | null) => {
  const rows = await resolveCampaignAudience(shopDomain, segmentId);
  return dedupeRecipientsBySubscriber(rows).length;
};

export const deleteSegment = async (shopDomain: string, segmentId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  await sql`
    DELETE FROM segments
    WHERE id = ${segmentId}
      AND shop_domain = ${shopDomain}
  `;
};

export const listQueuedCampaigns = async (limit = 25, shardCount = 1, shardIndex = 0) => {
  await ensureSchema();
  const sql = getNeonSql();

  const safeShardCount = Math.max(1, Math.min(Number(shardCount) || 1, 128));
  const safeShardIndex = Math.max(0, Math.min(Number(shardIndex) || 0, safeShardCount - 1));

  const rows = await sql`
    SELECT id, shop_domain
    FROM campaigns
    WHERE status IN ('queued', 'sending')
      AND (
        ${safeShardCount} = 1
        OR MOD(ABS(hashtext(id)), ${safeShardCount}) = ${safeShardIndex}
      )
    ORDER BY scheduled_at ASC NULLS LAST, sent_at ASC NULLS LAST, created_at ASC
    LIMIT ${limit}
  `;

  return rows as Array<{ id: string; shop_domain: string }>;
};

export const listStuckSendingCampaigns = async (limit = 25, shardCount = 1, shardIndex = 0) => {
  await ensureSchema();
  const sql = getNeonSql();

  const safeShardCount = Math.max(1, Math.min(Number(shardCount) || 1, 128));
  const safeShardIndex = Math.max(0, Math.min(Number(shardIndex) || 0, safeShardCount - 1));

  const rows = await sql`
    SELECT id, shop_domain
    FROM campaigns
    WHERE status = 'sending'
      AND sent_at IS NOT NULL
      AND sent_at < NOW() - INTERVAL '90 seconds'
      AND (
        ${safeShardCount} = 1
        OR MOD(ABS(hashtext(id)), ${safeShardCount}) = ${safeShardIndex}
      )
    ORDER BY sent_at ASC
    LIMIT ${limit}
  `;

  return rows as Array<{ id: string; shop_domain: string }>;
};

export const recoverStuckSendingCampaigns = async (limit = 25, shardCount = 1, shardIndex = 0) => {
  const stuck = await listStuckSendingCampaigns(limit, shardCount, shardIndex);
  if (stuck.length === 0) {
    return 0;
  }

  const sql = getNeonSql();
  const ids = stuck.map((item) => item.id);

  await sql`
    UPDATE campaigns
    SET status = 'queued'
    WHERE id = ANY(${ids}::text[])
      AND status = 'sending'
  `;

  const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
  void bumpCronWakeNow();

  return stuck.length;
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
      AND fcm_message_id IS NOT NULL
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

  const { audienceRead, d1CountActiveDeliverableSubscribers } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  const activeSubscriberCount = await audienceRead<number>({
    label: 'overview.activeDeliverableCount',
    key: (n) => String(n),
    neon: async () => {
      const rows = await sql`
        SELECT COUNT(DISTINCT s.id)::INT AS count
        FROM subscribers s
        JOIN subscriber_tokens t ON t.subscriber_id = s.id AND t.shop_domain = s.shop_domain
        WHERE s.shop_domain = ${shopDomain}
          AND t.status = 'active'
          AND (
            (
              COALESCE(t.token_type, 'fcm') = 'vapid'
              AND t.vapid_endpoint IS NOT NULL AND TRIM(t.vapid_endpoint) <> ''
              AND t.vapid_p256dh IS NOT NULL AND TRIM(t.vapid_p256dh) <> ''
              AND t.vapid_auth IS NOT NULL AND TRIM(t.vapid_auth) <> ''
            )
            OR (
              COALESCE(t.token_type, 'fcm') <> 'vapid'
              AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
            )
          )
      `;
      return Number(rows[0]?.count ?? 0);
    },
    d1: async () => d1CountActiveDeliverableSubscribers(shopDomain),
  });

  const { isD1CustomersEnabled, d1CountCustomers } = await import(
    '@/lib/server/integrations/d1-customers'
  );
  const customerCount = isD1CustomersEnabled()
    ? await d1CountCustomers(shopDomain)
    : Number(
        (
          await sql`
            SELECT COUNT(*)::INT AS count
            FROM shopify_customers
            WHERE shop_domain = ${shopDomain}
          `
        )[0]?.count ?? 0,
      );

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
    subscriberCount: activeSubscriberCount,
    customerCount,
    campaignCount: Number(campaignCountRows[0]?.count ?? 0),
  };
};

export const getMerchantCapabilitySnapshot = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();

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

/** Retry a D1 write a few times to ride out transient blips before we buffer. */
const withD1WriteRetries = async <T>(fn: () => Promise<T>, attempts = 3): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
  }
  throw lastError;
};

/**
 * Zero-loss safety net for d1_only. When the authoritative D1 token write fails
 * (D1 outage/blip), the full payload is durably captured in Neon so the cron
 * reconciler can replay it into D1. Deduped on (shop_domain, fcm_token) so repeat
 * attempts refresh the same row instead of piling up.
 */
const enqueueAudienceOutbox = async (input: UpsertTokenInput) => {
  const sql = getNeonSql();
  const payload = JSON.stringify(input);
  await sql`
    INSERT INTO d1_audience_outbox (shop_domain, external_id, fcm_token, payload)
    VALUES (${input.shopDomain}, ${input.externalId}, ${input.token}, ${payload}::jsonb)
    ON CONFLICT (shop_domain, fcm_token)
    DO UPDATE SET
      payload = EXCLUDED.payload,
      external_id = EXCLUDED.external_id,
      updated_at = NOW()
  `;
};

/**
 * Enqueue the welcome automation for a genuinely new token. Extracted so both the
 * live token write and the outbox reconciler trigger it identically. The existing
 * job/delivery dedupe below makes it safe to call more than once for the same
 * subscriber (idempotent).
 */
const maybeEnqueueWelcomeAutomation = async (params: {
  shopDomain: string;
  externalId: string;
  subscriberId: number;
  tokenId: number;
  tokenWasInserted: boolean;
}) => {
  const { shopDomain, externalId, subscriberId, tokenId, tokenWasInserted } = params;
  const sql = getNeonSql();

  const welcomeRuleRows = await sql`
    SELECT enabled, config
    FROM automation_rules
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
    LIMIT 1
  `;

  if (!(Boolean(welcomeRuleRows[0]?.enabled) && tokenWasInserted)) {
    return;
  }

  const existingWelcomeJobRows = await sql`
    SELECT id
    FROM automation_jobs
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
      AND payload ->> 'externalId' = ${externalId}
      AND status IN ('pending', 'processing', 'sent')
    LIMIT 1
  `;

  const existingWelcomeDelivery = await (async () => {
    const { hasAutomationDeliveryForRuleExternal } = await import(
      '@/lib/server/integrations/deliveries-data'
    );
    return hasAutomationDeliveryForRuleExternal({
      shopDomain,
      ruleKey: 'welcome_subscriber',
      externalId,
    });
  })();

  if (existingWelcomeJobRows.length > 0 || existingWelcomeDelivery) {
    return;
  }

  const welcomeConfig = parseWelcomeRuleConfig(welcomeRuleRows[0]?.config ?? null);
  const now = Date.now();
  const immediateWelcomeJobIds: string[] = [];

  for (const stepKey of Object.keys(welcomeConfig.steps) as WelcomeStepKey[]) {
    const step = welcomeConfig.steps[stepKey];
    if (!step.enabled) {
      continue;
    }

    const adjustedDelayMs = Math.max(0, step.delayMinutes * 60_000);
    const dueAt = new Date(now + adjustedDelayMs);

    const jobId = await enqueueAutomationJob({
      shopDomain,
      ruleKey: 'welcome_subscriber',
      tokenId,
      subscriberId,
      dedupeKey: `welcome:${shopDomain}:external:${externalId}:${stepKey}`,
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
        externalId,
        triggeredAt: new Date().toISOString(),
      },
    });

    if (step.delayMinutes <= 0 && jobId) {
      immediateWelcomeJobIds.push(jobId);
    }
  }

  if (immediateWelcomeJobIds.length > 0) {
    const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
    for (const jobId of immediateWelcomeJobIds) {
      const result = await processAutomationJob(jobId);
      if (!result.processed) {
        await sql`
          UPDATE automation_jobs
          SET
            status = 'pending',
            due_at = NOW() + INTERVAL '5 seconds',
            queue_enqueued_at = NULL,
            updated_at = NOW()
          WHERE id = ${jobId}
            AND status IN ('pending', 'processing')
        `;
        void bumpCronWakeNow();
      }
    }
  }
};

/**
 * Drain the d1_only zero-loss outbox: replay each buffered token into D1 (which
 * assigns the id, avoiding any Neon/D1 id-sequence collision), fire the welcome
 * automation if it was a new token, then delete the row. Runs every cron tick and
 * is a no-op (single count query) when the outbox is empty. Returns counts so the
 * tick can stay awake while rows remain.
 */
export const reconcileAudienceOutbox = async (limit = 500) => {
  const { isD1AudienceWriteEnabled, d1UpsertAudienceAuthoritative } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  // Only replayable when D1 is a write target. Rows stay safely buffered otherwise.
  if (!isD1AudienceWriteEnabled()) {
    return { processed: 0, failed: 0, remaining: 0, skipped: true };
  }

  await ensureSchema();
  const sql = getNeonSql();

  const rows = await sql`
    SELECT id, payload
    FROM d1_audience_outbox
    ORDER BY created_at ASC
    LIMIT ${limit}
  `;

  if (rows.length === 0) {
    return { processed: 0, failed: 0, remaining: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    const input = row.payload as UpsertTokenInput;
    const serializedDeviceContext = input.deviceContext ? JSON.stringify(input.deviceContext) : null;
    try {
      const result = await d1UpsertAudienceAuthoritative({
        shopDomain: input.shopDomain,
        externalId: input.externalId,
        browser: input.browser ?? null,
        platform: input.platform ?? null,
        locale: input.locale ?? null,
        country: input.country ?? null,
        city: input.city ?? null,
        deviceContext: serializedDeviceContext,
        token: input.token,
        userAgent: input.userAgent ?? null,
        tokenType: input.tokenType ?? 'fcm',
        vapidEndpoint: input.vapidEndpoint ?? null,
        vapidP256dh: input.vapidP256dh ?? null,
        vapidAuth: input.vapidAuth ?? null,
      });
      await maybeEnqueueWelcomeAutomation({
        shopDomain: input.shopDomain,
        externalId: input.externalId,
        subscriberId: result.subscriberId,
        tokenId: result.tokenId,
        tokenWasInserted: result.tokenWasInserted,
      });
      await sql`DELETE FROM d1_audience_outbox WHERE id = ${row.id}`;
      processed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error ?? '');
      await sql`
        UPDATE d1_audience_outbox
        SET attempts = attempts + 1, last_error = ${message}, updated_at = NOW()
        WHERE id = ${row.id}
      `;
    }
  }

  const remainingRows = await sql`SELECT COUNT(*)::int AS c FROM d1_audience_outbox`;
  return { processed, failed, remaining: Number(remainingRows[0]?.c ?? 0) };
};

/** Health/monitoring view of the zero-loss outbox — should read 0 pending. */
export const getAudienceOutboxStatus = async () => {
  await ensureSchema();
  const sql = getNeonSql();
  const rows = await sql`
    SELECT
      COUNT(*)::int AS pending,
      COALESCE(MAX(attempts), 0)::int AS max_attempts,
      MIN(created_at) AS oldest_created_at
    FROM d1_audience_outbox
  `;
  return {
    pending: Number(rows[0]?.pending ?? 0),
    maxAttempts: Number(rows[0]?.max_attempts ?? 0),
    oldestCreatedAt: rows[0]?.oldest_created_at ?? null,
  };
};

export const upsertSubscriberToken = async (input: UpsertTokenInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  const serializedDeviceContext = input.deviceContext ? JSON.stringify(input.deviceContext) : null;

  await ensureMerchant(input.shopDomain);
  await ensureAutomationRules(input.shopDomain);

  const {
    isD1AudienceOnly,
    isD1AudienceWriteEnabled,
    d1MirrorSubscriber,
    d1MirrorToken,
    d1UpsertAudienceAuthoritative,
  } = await import('@/lib/server/integrations/d1-audience');

  let subscriberId: number;
  let tokenId: number;
  let tokenWasInserted: boolean;
  const optInPromptType =
    input.optInPromptType === 'browser' || input.optInPromptType === 'custom'
      ? input.optInPromptType
      : null;

  if (isD1AudienceOnly()) {
    // d1_only: D1 is the sole store and assigns the ids. Neon audience tables are
    // no longer written. We retry a few times to ride out transient D1 blips; if
    // it still fails we durably buffer the payload to the Neon outbox so the cron
    // reconciler can replay it into D1 — a token is NEVER lost, even during a D1
    // outage.
    try {
      const result = await withD1WriteRetries(() =>
        d1UpsertAudienceAuthoritative({
          shopDomain: input.shopDomain,
          externalId: input.externalId,
          browser: input.browser ?? null,
          platform: input.platform ?? null,
          locale: input.locale ?? null,
          country: input.country ?? null,
          city: input.city ?? null,
          deviceContext: serializedDeviceContext,
          token: input.token,
          userAgent: input.userAgent ?? null,
          tokenType: input.tokenType ?? 'fcm',
          vapidEndpoint: input.vapidEndpoint ?? null,
          vapidP256dh: input.vapidP256dh ?? null,
          vapidAuth: input.vapidAuth ?? null,
          optInPromptType: optInPromptType,
        }),
      );
      subscriberId = result.subscriberId;
      tokenId = result.tokenId;
      tokenWasInserted = result.tokenWasInserted;
    } catch (d1Error) {
      await enqueueAudienceOutbox(input);
      // Wake the cron promptly so the reconciler drains the buffered token within a
      // tick instead of waiting out the idle sleep window.
      try {
        const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
        void bumpCronWakeNow();
      } catch {
        // best-effort wake
      }
      console.error(
        '[audience] d1_only token write failed; buffered to outbox for replay',
        d1Error instanceof Error ? d1Error.message : d1Error,
      );
      const { invalidateShopDashboardCaches } = await import('@/lib/server/cache/api-kv-cache');
      void invalidateShopDashboardCaches(input.shopDomain);
      // The token is safely captured; ids will be assigned by D1 on replay.
      return { subscriberId: 0, tokenId: 0, buffered: true };
    }
  } else {
    const subscriberRows = await sql`
      INSERT INTO subscribers (shop_domain, external_id, browser, platform, locale, country, city, device_context, opt_in_prompt_type, last_seen_at)
      VALUES (
        ${input.shopDomain},
        ${input.externalId},
        ${input.browser ?? null},
        ${input.platform ?? null},
        ${input.locale ?? null},
        ${input.country ?? null},
        ${input.city ?? null},
        ${serializedDeviceContext}::jsonb,
        ${optInPromptType},
        NOW()
      )
      ON CONFLICT (shop_domain, external_id)
      DO UPDATE SET
        browser = EXCLUDED.browser,
        platform = EXCLUDED.platform,
        locale = EXCLUDED.locale,
        country = COALESCE(NULLIF(EXCLUDED.country, ''), subscribers.country),
        city = COALESCE(EXCLUDED.city, subscribers.city),
        device_context = COALESCE(EXCLUDED.device_context, subscribers.device_context),
        opt_in_prompt_type = COALESCE(subscribers.opt_in_prompt_type, EXCLUDED.opt_in_prompt_type),
        last_seen_at = NOW()
      RETURNING id
    `;

    subscriberId = Number(subscriberRows[0]?.id);

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

    tokenId = Number(tokenRows[0]?.id);
    tokenWasInserted = Boolean(tokenRows[0]?.was_inserted);

    // Stage-1/2 audience dual-write: mirror the Neon rows into D1 using the ids
    // Neon just assigned. No-op (instant return) when D1_AUDIENCE_MODE is off.
    if (isD1AudienceWriteEnabled()) {
      await d1MirrorSubscriber({
        id: subscriberId,
        shopDomain: input.shopDomain,
        externalId: input.externalId,
        browser: input.browser ?? null,
        platform: input.platform ?? null,
        locale: input.locale ?? null,
        country: input.country ?? null,
        city: input.city ?? null,
        deviceContext: serializedDeviceContext,
      });
      await d1MirrorToken({
        id: tokenId,
        shopDomain: input.shopDomain,
        subscriberId,
        fcmToken: input.token,
        userAgent: input.userAgent ?? null,
        status: 'active',
        tokenType: input.tokenType ?? 'fcm',
        vapidEndpoint: input.vapidEndpoint ?? null,
        vapidP256dh: input.vapidP256dh ?? null,
        vapidAuth: input.vapidAuth ?? null,
      });
    }
  }

  try {
    await maybeEnqueueWelcomeAutomation({
      shopDomain: input.shopDomain,
      externalId: input.externalId,
      subscriberId,
      tokenId,
      tokenWasInserted,
    });
  } catch (welcomeError) {
    console.error(
      '[audience] welcome automation enqueue failed; token saved',
      welcomeError instanceof Error ? welcomeError.message : welcomeError,
    );
  }

  if (tokenWasInserted && optInPromptType) {
    // Attribute conversion to the prompt that collected this token (not the merchant's
    // *current* setting, which may have changed). Never credit silent re-syncs —
    // those omit optInPromptType. Conversion also back-fills a click if the click
    // beacon was lost, so subscribers can never exceed clicks.
    await recordOptInPromptConversion(input.shopDomain, optInPromptType);
  }

  const { invalidateShopDashboardCaches } = await import('@/lib/server/cache/api-kv-cache');
  void invalidateShopDashboardCaches(input.shopDomain);

  return {
    subscriberId,
    tokenId,
    tokenWasInserted,
  };
};

const roundOptInPercent = (value: number) => Math.round(value * 10) / 10;

const buildOptInTypeStats = (views: number, clicks: number, conversions: number): OptInPromptTypeStats => ({
  views,
  clicks,
  conversions,
  conversionPercent: views > 0 ? roundOptInPercent((conversions / views) * 100) : 0,
  clickConversionPercent: clicks > 0 ? roundOptInPercent((conversions / clicks) * 100) : 0,
});

export const recordOptInPromptEvent = async (input: {
  shopDomain: string;
  promptType: OptInPromptType;
  eventType: OptInPromptEventType;
}) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(input.shopDomain);

  const viewDelta = input.eventType === 'view' ? 1 : 0;
  const clickDelta = input.eventType === 'click' ? 1 : 0;

  await sql`
    INSERT INTO opt_in_prompt_stats (shop_domain, prompt_type, views, clicks, conversions, updated_at)
    VALUES (${input.shopDomain}, ${input.promptType}, ${viewDelta}, ${clickDelta}, 0, NOW())
    ON CONFLICT (shop_domain, prompt_type)
    DO UPDATE SET
      views = opt_in_prompt_stats.views + ${viewDelta},
      clicks = opt_in_prompt_stats.clicks + ${clickDelta},
      updated_at = NOW()
  `;

  const { invalidateShopDashboardCaches } = await import('@/lib/server/cache/api-kv-cache');
  void invalidateShopDashboardCaches(input.shopDomain);
};

export const recordOptInPromptConversion = async (shopDomain: string, promptType: OptInPromptType) => {
  await ensureSchema();
  const sql = getNeonSql();
  await ensureMerchant(shopDomain);

  // A successful subscribe implies an Allow click. If the click beacon was dropped
  // (ad blockers, 401, network), raise clicks to match — never drop below conversions.
  // When the click already landed, GREATEST keeps clicks unchanged (no double count).
  await sql`
    INSERT INTO opt_in_prompt_stats (shop_domain, prompt_type, views, clicks, conversions, updated_at)
    VALUES (${shopDomain}, ${promptType}, 1, 1, 1, NOW())
    ON CONFLICT (shop_domain, prompt_type)
    DO UPDATE SET
      conversions = opt_in_prompt_stats.conversions + 1,
      clicks = GREATEST(opt_in_prompt_stats.clicks, opt_in_prompt_stats.conversions + 1),
      views = GREATEST(opt_in_prompt_stats.views, GREATEST(opt_in_prompt_stats.clicks, opt_in_prompt_stats.conversions + 1)),
      updated_at = NOW()
  `;

  const { invalidateShopDashboardCaches } = await import('@/lib/server/cache/api-kv-cache');
  void invalidateShopDashboardCaches(shopDomain);
};

export const getOptInPromptStats = async (
  shopDomain: string,
  activePromptType: OptInSettings['promptType'] = 'custom',
): Promise<OptInPromptStatsBundle> => {
  await ensureSchema();
  const sql = getNeonSql();

  const rows = await sql`
    SELECT prompt_type, views, clicks, conversions
    FROM opt_in_prompt_stats
    WHERE shop_domain = ${shopDomain}
  `;

  const byType = new Map<string, { views: number; clicks: number; conversions: number }>();
  for (const row of rows) {
    byType.set(String(row.prompt_type), {
      views: Number(row.views ?? 0),
      clicks: Number(row.clicks ?? 0),
      conversions: Number(row.conversions ?? 0),
    });
  }

  const browserRow = byType.get('browser') ?? { views: 0, clicks: 0, conversions: 0 };
  const customRow = byType.get('custom') ?? { views: 0, clicks: 0, conversions: 0 };

  // Repair historically inconsistent rows (conversions credited without clicks)
  // so the dashboard never shows more subscribers than clicks.
  const normalizeRow = (row: { views: number; clicks: number; conversions: number }) => {
    const conversions = Math.max(0, row.conversions);
    const clicks = Math.max(row.clicks, conversions);
    const views = Math.max(row.views, clicks);
    return { views, clicks, conversions };
  };

  const browserNormalized = normalizeRow(browserRow);
  const customNormalized = normalizeRow(customRow);

  // Persist the clamp once so future reads stay consistent without re-computing.
  if (
    browserNormalized.clicks !== browserRow.clicks ||
    browserNormalized.views !== browserRow.views ||
    customNormalized.clicks !== customRow.clicks ||
    customNormalized.views !== customRow.views
  ) {
    if (browserNormalized.clicks !== browserRow.clicks || browserNormalized.views !== browserRow.views) {
      await sql`
        UPDATE opt_in_prompt_stats
        SET
          clicks = GREATEST(clicks, conversions),
          views = GREATEST(views, GREATEST(clicks, conversions)),
          updated_at = NOW()
        WHERE shop_domain = ${shopDomain}
          AND prompt_type = 'browser'
          AND (clicks < conversions OR views < GREATEST(clicks, conversions))
      `;
    }
    if (customNormalized.clicks !== customRow.clicks || customNormalized.views !== customRow.views) {
      await sql`
        UPDATE opt_in_prompt_stats
        SET
          clicks = GREATEST(clicks, conversions),
          views = GREATEST(views, GREATEST(clicks, conversions)),
          updated_at = NOW()
        WHERE shop_domain = ${shopDomain}
          AND prompt_type = 'custom'
          AND (clicks < conversions OR views < GREATEST(clicks, conversions))
      `;
    }
  }

  const browser = buildOptInTypeStats(browserNormalized.views, browserNormalized.clicks, browserNormalized.conversions);
  const custom = buildOptInTypeStats(customNormalized.views, customNormalized.clicks, customNormalized.conversions);
  const combined = buildOptInTypeStats(
    browser.views + custom.views,
    browser.clicks + custom.clicks,
    browser.conversions + custom.conversions,
  );

  return {
    browser,
    custom,
    totals: {
      views: combined.views,
      clicks: combined.clicks,
      conversions: combined.conversions,
      conversionPercent: combined.conversionPercent,
      avgConversionPercent: combined.conversionPercent,
      avgClickConversionPercent: combined.clickConversionPercent,
    },
  };
};

export const countActiveDeliverableSubscribers = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  const { audienceRead, d1CountActiveDeliverableSubscribers } = await import(
    '@/lib/server/integrations/d1-audience'
  );

  return audienceRead<number>({
    label: 'countActiveDeliverableSubscribers',
    key: (n) => String(n),
    neon: async () => {
      const rows = await sql`
        SELECT COUNT(DISTINCT s.id)::BIGINT AS count
        FROM subscribers s
        JOIN subscriber_tokens t ON t.subscriber_id = s.id AND t.shop_domain = s.shop_domain
        WHERE s.shop_domain = ${shopDomain}
          AND t.status = 'active'
          AND (
            (
              COALESCE(t.token_type, 'fcm') = 'vapid'
              AND t.vapid_endpoint IS NOT NULL AND TRIM(t.vapid_endpoint) <> ''
              AND t.vapid_p256dh IS NOT NULL AND TRIM(t.vapid_p256dh) <> ''
              AND t.vapid_auth IS NOT NULL AND TRIM(t.vapid_auth) <> ''
            )
            OR (
              COALESCE(t.token_type, 'fcm') <> 'vapid'
              AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
            )
          )
      `;
      return Number(rows[0]?.count ?? 0);
    },
    d1: async () => d1CountActiveDeliverableSubscribers(shopDomain),
  });
};

export const recordIosHomeScreenConfirmed = async (input: RecordIosHomeScreenInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  const serializedDeviceContext = input.deviceContext ? JSON.stringify(input.deviceContext) : null;

  await ensureMerchant(input.shopDomain);

  const {
    isD1AudienceOnly,
    isD1AudienceWriteEnabled,
    d1MirrorSubscriber,
    d1RecordIosHomeScreenConfirmedAuthoritative,
  } = await import('@/lib/server/integrations/d1-audience');

  let iosSubscriberId: number;
  let iosConfirmedAt: string | null;
  let iosLastSeenAt: string | null;

  if (isD1AudienceOnly()) {
    const nowIso = new Date().toISOString();
    const result = await d1RecordIosHomeScreenConfirmedAuthoritative({
      shopDomain: input.shopDomain,
      externalId: input.externalId,
      browser: input.browser ?? null,
      platform: input.platform ?? 'ios',
      locale: input.locale ?? null,
      country: input.country ?? null,
      city: input.city ?? null,
      deviceContext: serializedDeviceContext,
      confirmedAt: nowIso,
      lastSeenAt: nowIso,
    });
    iosSubscriberId = result.subscriberId;
    iosConfirmedAt = result.confirmedAt;
    iosLastSeenAt = result.lastSeenAt;
  } else {
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

    iosSubscriberId = Number(subscriberRows[0]?.id);
    iosConfirmedAt = subscriberRows[0]?.ios_home_screen_confirmed_at
      ? String(subscriberRows[0].ios_home_screen_confirmed_at)
      : null;
    iosLastSeenAt = subscriberRows[0]?.ios_home_screen_last_seen_at
      ? String(subscriberRows[0].ios_home_screen_last_seen_at)
      : null;

    if (isD1AudienceWriteEnabled()) {
      await d1MirrorSubscriber({
        id: iosSubscriberId,
        shopDomain: input.shopDomain,
        externalId: input.externalId,
        browser: input.browser ?? null,
        platform: input.platform ?? 'ios',
        locale: input.locale ?? null,
        country: input.country ?? null,
        city: input.city ?? null,
        deviceContext: serializedDeviceContext,
        iosHomeScreenConfirmedAt: iosConfirmedAt,
        iosHomeScreenLastSeenAt: iosLastSeenAt,
      });
    }
  }

  return {
    subscriberId: iosSubscriberId,
    confirmedAt: iosConfirmedAt,
    lastSeenAt: iosLastSeenAt,
  };
};

/**
 * Stage-1 backfill: copy existing Neon audience rows into the D1 mirror using
 * id-keyed cursors so it is safe to call repeatedly / resume. One call processes
 * up to `maxBatches` batches of `batchSize` rows for each table, then returns the
 * cursors so the caller can continue where it left off.
 */
export const backfillAudienceToD1 = async (options?: {
  batchSize?: number;
  maxBatches?: number;
  afterSubscriberId?: number;
  afterTokenId?: number;
}) => {
  await ensureSchema();
  const sql = getNeonSql();

  const {
    isD1AudienceWriteEnabled,
    d1BackfillSubscribers,
    d1BackfillTokens,
  } = await import('@/lib/server/integrations/d1-audience');

  if (!isD1AudienceWriteEnabled()) {
    throw new Error('D1_AUDIENCE_MODE is off — set it to dual_write (or read) before backfilling.');
  }

  const batchSize = Math.min(Math.max(options?.batchSize ?? 50, 1), 100);
  const maxBatches = Math.min(Math.max(options?.maxBatches ?? 50, 1), 1000);

  let subscriberCursor = Number(options?.afterSubscriberId ?? 0);
  let tokenCursor = Number(options?.afterTokenId ?? 0);
  let subscribersCopied = 0;
  let tokensCopied = 0;
  let subscribersDone = false;
  let tokensDone = false;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    if (subscribersDone && tokensDone) {
      break;
    }

    if (!subscribersDone) {
      const rows = await sql`
        SELECT id, shop_domain, external_id, browser, platform, locale, country, city,
               device_context, created_at, last_seen_at,
               ios_home_screen_confirmed_at, ios_home_screen_last_seen_at
        FROM subscribers
        WHERE id > ${subscriberCursor}
        ORDER BY id ASC
        LIMIT ${batchSize}
      `;
      if (rows.length === 0) {
        subscribersDone = true;
      } else {
        await d1BackfillSubscribers(
          (rows as Array<Record<string, unknown>>).map((row) => ({
            id: Number(row.id),
            shop_domain: String(row.shop_domain),
            external_id: String(row.external_id),
            browser: row.browser == null ? null : String(row.browser),
            platform: row.platform == null ? null : String(row.platform),
            locale: row.locale == null ? null : String(row.locale),
            country: row.country == null ? null : String(row.country),
            city: row.city == null ? null : String(row.city),
            device_context:
              row.device_context == null
                ? null
                : typeof row.device_context === 'string'
                  ? row.device_context
                  : JSON.stringify(row.device_context),
            created_at: row.created_at,
            last_seen_at: row.last_seen_at,
            ios_home_screen_confirmed_at: row.ios_home_screen_confirmed_at,
            ios_home_screen_last_seen_at: row.ios_home_screen_last_seen_at,
          })),
        );
        subscribersCopied += rows.length;
        subscriberCursor = Number(rows[rows.length - 1]?.id ?? subscriberCursor);
        if (rows.length < batchSize) {
          subscribersDone = true;
        }
      }
    }

    if (!tokensDone) {
      const rows = await sql`
        SELECT id, shop_domain, subscriber_id, fcm_token, user_agent, status, token_type,
               vapid_endpoint, vapid_p256dh, vapid_auth, created_at, updated_at, last_seen_at
        FROM subscriber_tokens
        WHERE id > ${tokenCursor}
        ORDER BY id ASC
        LIMIT ${batchSize}
      `;
      if (rows.length === 0) {
        tokensDone = true;
      } else {
        await d1BackfillTokens(
          (rows as Array<Record<string, unknown>>).map((row) => ({
            id: Number(row.id),
            shop_domain: String(row.shop_domain),
            subscriber_id: Number(row.subscriber_id),
            fcm_token: String(row.fcm_token),
            user_agent: row.user_agent == null ? null : String(row.user_agent),
            status: row.status == null ? 'active' : String(row.status),
            token_type: row.token_type == null ? 'fcm' : String(row.token_type),
            vapid_endpoint: row.vapid_endpoint == null ? null : String(row.vapid_endpoint),
            vapid_p256dh: row.vapid_p256dh == null ? null : String(row.vapid_p256dh),
            vapid_auth: row.vapid_auth == null ? null : String(row.vapid_auth),
            created_at: row.created_at,
            updated_at: row.updated_at,
            last_seen_at: row.last_seen_at,
          })),
        );
        tokensCopied += rows.length;
        tokenCursor = Number(rows[rows.length - 1]?.id ?? tokenCursor);
        if (rows.length < batchSize) {
          tokensDone = true;
        }
      }
    }
  }

  return {
    subscribersCopied,
    tokensCopied,
    nextSubscriberCursor: subscriberCursor,
    nextTokenCursor: tokenCursor,
    done: subscribersDone && tokensDone,
  };
};

/**
 * Stage-1 verification: compare Neon vs D1 row counts (overall or per-shop) so we
 * can confirm parity before flipping reads to D1 (Stage 2).
 */
export const verifyAudienceD1Parity = async (shopDomain?: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const { d1CountSubscribers, d1CountTokens } = await import(
    '@/lib/server/integrations/d1-audience'
  );

  const [neonSubRows, neonTokRows] = await Promise.all([
    shopDomain
      ? sql`SELECT COUNT(*)::BIGINT AS count FROM subscribers WHERE shop_domain = ${shopDomain}`
      : sql`SELECT COUNT(*)::BIGINT AS count FROM subscribers`,
    shopDomain
      ? sql`SELECT COUNT(*)::BIGINT AS count FROM subscriber_tokens WHERE shop_domain = ${shopDomain}`
      : sql`SELECT COUNT(*)::BIGINT AS count FROM subscriber_tokens`,
  ]);

  const neonSubscribers = Number(neonSubRows[0]?.count ?? 0);
  const neonTokens = Number(neonTokRows[0]?.count ?? 0);
  const [d1Subscribers, d1Tokens] = await Promise.all([
    d1CountSubscribers(shopDomain),
    d1CountTokens(shopDomain),
  ]);

  return {
    shopDomain: shopDomain ?? null,
    neonSubscribers,
    d1Subscribers,
    subscribersMatch: neonSubscribers === d1Subscribers,
    neonTokens,
    d1Tokens,
    tokensMatch: neonTokens === d1Tokens,
    inSync: neonSubscribers === d1Subscribers && neonTokens === d1Tokens,
  };
};

/**
 * One-time commerce -> D1 backfill (orders + their line items + fulfillments).
 * Idempotent: orders upsert on (shop_domain, order_id) and items are replaced, so
 * re-running is safe. Resume large datasets by passing back the returned cursors.
 * Items are matched to their parent via the Neon order id (order_event_id), which
 * is globally unique, so there is no cross-shop ambiguity.
 */
export const backfillCommerceToD1 = async (options?: {
  batchSize?: number;
  maxBatches?: number;
  afterOrderId?: number;
  afterFulfillmentId?: number;
}) => {
  await ensureSchema();
  const sql = getNeonSql();

  const { isD1CommerceEnabled, d1UpsertOrderEvent, d1UpsertFulfillment } = await import(
    '@/lib/server/integrations/d1-commerce'
  );
  if (!isD1CommerceEnabled()) {
    throw new Error('D1_COMMERCE_ENABLED is off — enable it before backfilling.');
  }

  const batchSize = Math.min(Math.max(options?.batchSize ?? 25, 1), 100);
  const maxBatches = Math.min(Math.max(options?.maxBatches ?? 40, 1), 1000);

  let orderCursor = Number(options?.afterOrderId ?? 0);
  let fulfillmentCursor = Number(options?.afterFulfillmentId ?? 0);
  let ordersCopied = 0;
  let orderItemsCopied = 0;
  let fulfillmentsCopied = 0;
  let ordersDone = false;
  let fulfillmentsDone = false;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    if (ordersDone && fulfillmentsDone) {
      break;
    }

    if (!ordersDone) {
      const rows = await sql`
        SELECT id, shop_domain, order_id, external_id, customer_id, email,
               subscriber_id, total_price_cents, created_at
        FROM shopify_orders
        WHERE id > ${orderCursor}
        ORDER BY id ASC
        LIMIT ${batchSize}
      `;
      if (rows.length === 0) {
        ordersDone = true;
      } else {
        const neonOrderIds = rows.map((row) => Number(row.id));
        const itemRows = await sql`
          SELECT order_event_id, product_id, product_title, collection_hint
          FROM shopify_order_items
          WHERE order_event_id = ANY(${neonOrderIds})
        `;
        const itemsByOrder = new Map<number, Array<Record<string, unknown>>>();
        for (const item of itemRows as Array<Record<string, unknown>>) {
          const key = Number(item.order_event_id);
          const list = itemsByOrder.get(key) ?? [];
          list.push(item);
          itemsByOrder.set(key, list);
        }

        for (const row of rows as Array<Record<string, unknown>>) {
          const items = itemsByOrder.get(Number(row.id)) ?? [];
          await d1UpsertOrderEvent({
            shopDomain: String(row.shop_domain),
            orderId: String(row.order_id),
            externalId: row.external_id == null ? null : String(row.external_id),
            customerId: row.customer_id == null ? null : String(row.customer_id),
            email: row.email == null ? null : String(row.email),
            subscriberId: row.subscriber_id == null ? null : Number(row.subscriber_id),
            totalPriceCents: Number(row.total_price_cents ?? 0),
            createdAt: row.created_at == null ? null : String(row.created_at),
            lineItems: items.map((item) => ({
              productId: item.product_id == null ? null : String(item.product_id),
              productTitle: item.product_title == null ? null : String(item.product_title),
              collectionHint: item.collection_hint == null ? null : String(item.collection_hint),
            })),
          });
          orderItemsCopied += items.length;
        }

        ordersCopied += rows.length;
        orderCursor = Number(rows[rows.length - 1]?.id ?? orderCursor);
        if (rows.length < batchSize) {
          ordersDone = true;
        }
      }
    }

    if (!fulfillmentsDone) {
      const rows = await sql`
        SELECT id, shop_domain, fulfillment_id, order_id, status, shipment_status,
               tracking_company, tracking_numbers, tracking_urls, updated_at
        FROM shopify_fulfillments
        WHERE id > ${fulfillmentCursor}
        ORDER BY id ASC
        LIMIT ${batchSize}
      `;
      if (rows.length === 0) {
        fulfillmentsDone = true;
      } else {
        for (const row of rows as Array<Record<string, unknown>>) {
          await d1UpsertFulfillment({
            shopDomain: String(row.shop_domain),
            fulfillmentId: String(row.fulfillment_id),
            orderId: String(row.order_id),
            status: row.status == null ? null : String(row.status),
            shipmentStatus: row.shipment_status == null ? null : String(row.shipment_status),
            trackingCompany: row.tracking_company == null ? null : String(row.tracking_company),
            trackingNumbers: row.tracking_numbers ?? [],
            trackingUrls: row.tracking_urls ?? [],
            updatedAt: row.updated_at == null ? null : String(row.updated_at),
          });
        }
        fulfillmentsCopied += rows.length;
        fulfillmentCursor = Number(rows[rows.length - 1]?.id ?? fulfillmentCursor);
        if (rows.length < batchSize) {
          fulfillmentsDone = true;
        }
      }
    }
  }

  return {
    ordersCopied,
    orderItemsCopied,
    fulfillmentsCopied,
    nextOrderCursor: orderCursor,
    nextFulfillmentCursor: fulfillmentCursor,
    ordersDone,
    fulfillmentsDone,
    done: ordersDone && fulfillmentsDone,
  };
};

/**
 * Commerce parity: Neon vs D1 row counts (overall or per-shop) so we can confirm the
 * backfill is complete before relying on D1 reads.
 */
export const verifyCommerceD1Parity = async (shopDomain?: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const { d1CountOrders, d1CountOrderItems, d1CountFulfillments } = await import(
    '@/lib/server/integrations/d1-commerce'
  );

  const [neonOrderRows, neonItemRows, neonFulfillmentRows] = await Promise.all([
    shopDomain
      ? sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_orders WHERE shop_domain = ${shopDomain}`
      : sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_orders`,
    shopDomain
      ? sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_order_items WHERE shop_domain = ${shopDomain}`
      : sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_order_items`,
    shopDomain
      ? sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_fulfillments WHERE shop_domain = ${shopDomain}`
      : sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_fulfillments`,
  ]);

  const neonOrders = Number(neonOrderRows[0]?.count ?? 0);
  const neonOrderItems = Number(neonItemRows[0]?.count ?? 0);
  const neonFulfillments = Number(neonFulfillmentRows[0]?.count ?? 0);

  const [d1Orders, d1OrderItems, d1Fulfillments] = await Promise.all([
    d1CountOrders(shopDomain),
    d1CountOrderItems(shopDomain),
    d1CountFulfillments(shopDomain),
  ]);

  return {
    shopDomain: shopDomain ?? null,
    neonOrders,
    d1Orders,
    ordersMatch: neonOrders === d1Orders,
    neonOrderItems,
    d1OrderItems,
    orderItemsMatch: neonOrderItems === d1OrderItems,
    neonFulfillments,
    d1Fulfillments,
    fulfillmentsMatch: neonFulfillments === d1Fulfillments,
    inSync:
      neonOrders === d1Orders &&
      neonOrderItems === d1OrderItems &&
      neonFulfillments === d1Fulfillments,
  };
};

/**
 * One-time customer cache -> D1 backfill. Idempotent via upsert on
 * (shop_domain, customer_id). Email-only rows (customer_id NULL) append.
 */
export const backfillCustomersToD1 = async (options?: {
  batchSize?: number;
  maxBatches?: number;
  afterId?: number;
}) => {
  await ensureSchema();
  const sql = getNeonSql();

  const { isD1CustomersEnabled, d1UpsertCustomer } = await import(
    '@/lib/server/integrations/d1-customers'
  );
  if (!isD1CustomersEnabled()) {
    throw new Error('D1_CUSTOMERS_ENABLED is off — enable it before backfilling.');
  }

  const batchSize = Math.min(Math.max(options?.batchSize ?? 50, 1), 200);
  const maxBatches = Math.min(Math.max(options?.maxBatches ?? 40, 1), 1000);
  let cursor = Number(options?.afterId ?? 0);
  let copied = 0;
  let done = false;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const rows = await sql`
      SELECT id, shop_domain, customer_id, external_id, email, first_name, last_name, tags
      FROM shopify_customers
      WHERE id > ${cursor}
      ORDER BY id ASC
      LIMIT ${batchSize}
    `;
    if (rows.length === 0) {
      done = true;
      break;
    }

    for (const row of rows as Array<Record<string, unknown>>) {
      await d1UpsertCustomer({
        shopDomain: String(row.shop_domain),
        customerId: row.customer_id == null ? null : String(row.customer_id),
        externalId: row.external_id == null ? null : String(row.external_id),
        email: row.email == null ? null : String(row.email),
        firstName: row.first_name == null ? null : String(row.first_name),
        lastName: row.last_name == null ? null : String(row.last_name),
        tags: row.tags == null ? null : String(row.tags),
      });
    }

    copied += rows.length;
    cursor = Number(rows[rows.length - 1]?.id ?? cursor);
    if (rows.length < batchSize) {
      done = true;
      break;
    }
  }

  return { customersCopied: copied, nextCursor: cursor, done };
};

/**
 * One-time product variant catalog -> D1 backfill. Idempotent via upsert on
 * (shop_domain, variant_id).
 */
export const backfillCatalogToD1 = async (options?: {
  batchSize?: number;
  maxBatches?: number;
  afterVariantId?: string;
  afterShopDomain?: string;
}) => {
  await ensureSchema();
  const sql = getNeonSql();

  const { isD1CatalogEnabled, d1UpsertVariant } = await import(
    '@/lib/server/integrations/d1-catalog'
  );
  if (!isD1CatalogEnabled()) {
    throw new Error('D1_CATALOG_ENABLED is off — enable it before backfilling.');
  }

  const batchSize = Math.min(Math.max(options?.batchSize ?? 50, 1), 200);
  const maxBatches = Math.min(Math.max(options?.maxBatches ?? 40, 1), 1000);
  const afterShop = options?.afterShopDomain ?? '';
  const afterVariant = options?.afterVariantId ?? '';
  let copied = 0;
  let done = false;
  let lastShop = afterShop;
  let lastVariant = afterVariant;

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const rows = await sql`
      SELECT shop_domain, product_id, variant_id, inventory_item_id, product_title,
             variant_title, handle, image_url, price_cents, compare_at_price_cents,
             available, updated_at, last_seen_at
      FROM shopify_product_variants
      WHERE (shop_domain, variant_id) > (${lastShop}, ${lastVariant})
      ORDER BY shop_domain ASC, variant_id ASC
      LIMIT ${batchSize}
    `;
    if (rows.length === 0) {
      done = true;
      break;
    }

    for (const row of rows as Array<Record<string, unknown>>) {
      const updatedAt = row.updated_at ? new Date(String(row.updated_at)).toISOString() : new Date().toISOString();
      const lastSeenAt = row.last_seen_at ? new Date(String(row.last_seen_at)).toISOString() : updatedAt;
      await d1UpsertVariant({
        shopDomain: String(row.shop_domain),
        productId: String(row.product_id),
        variantId: String(row.variant_id),
        inventoryItemId: row.inventory_item_id == null ? null : String(row.inventory_item_id),
        productTitle: row.product_title == null ? null : String(row.product_title),
        variantTitle: row.variant_title == null ? null : String(row.variant_title),
        handle: row.handle == null ? null : String(row.handle),
        imageUrl: row.image_url == null ? null : String(row.image_url),
        priceCents: row.price_cents == null ? null : Number(row.price_cents),
        compareAtPriceCents: row.compare_at_price_cents == null ? null : Number(row.compare_at_price_cents),
        available: row.available == null ? null : Number(row.available),
        updatedAtIso: updatedAt,
        lastSeenAtIso: lastSeenAt,
      });
    }

    copied += rows.length;
    const tail = rows[rows.length - 1] as Record<string, unknown>;
    lastShop = String(tail.shop_domain);
    lastVariant = String(tail.variant_id);
    if (rows.length < batchSize) {
      done = true;
      break;
    }
  }

  return {
    variantsCopied: copied,
    nextShopDomain: lastShop,
    nextVariantId: lastVariant,
    done,
  };
};

export const verifyCustomersD1Parity = async (shopDomain?: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  const { d1CountCustomers } = await import('@/lib/server/integrations/d1-customers');

  const neonRows = shopDomain
    ? await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_customers WHERE shop_domain = ${shopDomain}`
    : await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_customers`;
  const neonCustomers = Number(neonRows[0]?.count ?? 0);
  const d1Customers = await d1CountCustomers(shopDomain);

  return {
    shopDomain: shopDomain ?? null,
    neonCustomers,
    d1Customers,
    customersMatch: neonCustomers === d1Customers,
    inSync: neonCustomers === d1Customers,
  };
};

export const verifyCatalogD1Parity = async (shopDomain?: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  const { d1CountVariants } = await import('@/lib/server/integrations/d1-catalog');

  const neonRows = shopDomain
    ? await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_product_variants WHERE shop_domain = ${shopDomain}`
    : await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_product_variants`;
  const neonVariants = Number(neonRows[0]?.count ?? 0);
  const d1Variants = await d1CountVariants(shopDomain);

  return {
    shopDomain: shopDomain ?? null,
    neonVariants,
    d1Variants,
    variantsMatch: neonVariants === d1Variants,
    inSync: neonVariants === d1Variants,
  };
};

/**
 * Remove D1 catalog rows that no longer exist on Neon (e.g. stale rows from a
 * partial cutover or deleted products). Neon is the source of truth during
 * backfill; after cutover only D1 receives writes.
 */
export const reconcileCatalogD1WithNeon = async () => {
  await ensureSchema();
  const sql = getNeonSql();

  const { isD1CatalogEnabled, d1ListAllVariantKeys, d1DeleteVariant } = await import(
    '@/lib/server/integrations/d1-catalog'
  );
  if (!isD1CatalogEnabled()) {
    throw new Error('D1_CATALOG_ENABLED is off.');
  }

  const neonRows = await sql`SELECT shop_domain, variant_id FROM shopify_product_variants`;
  const neonKeys = new Set(
    (neonRows as Array<Record<string, unknown>>).map(
      (row) => `${String(row.shop_domain)}::${String(row.variant_id)}`,
    ),
  );

  const d1Keys = await d1ListAllVariantKeys();
  let deleted = 0;
  for (const row of d1Keys) {
    const key = `${row.shopDomain}::${row.variantId}`;
    if (!neonKeys.has(key)) {
      await d1DeleteVariant(row.shopDomain, row.variantId);
      deleted += 1;
    }
  }

  return { deleted, neonVariants: neonKeys.size, d1VariantsBefore: d1Keys.length };
};

/**
 * After D1 cutover + parity confirmation, delete the Neon copies of commerce/
 * customer/catalog cache tables. These tables are no longer written when their
 * respective D1 flags are on; keeping the stale rows only wastes Neon storage.
 */
export const purgeNeonCommerceCacheAfterD1Cutover = async () => {
  await ensureSchema();
  const sql = getNeonSql();

  const { isD1CommerceEnabled } = await import('@/lib/server/integrations/d1-commerce');
  const { isD1CustomersEnabled } = await import('@/lib/server/integrations/d1-customers');
  const { isD1CatalogEnabled } = await import('@/lib/server/integrations/d1-catalog');

  if (!isD1CommerceEnabled() || !isD1CustomersEnabled() || !isD1CatalogEnabled()) {
    throw new Error('All D1_COMMERCE_ENABLED, D1_CUSTOMERS_ENABLED, and D1_CATALOG_ENABLED must be on before purging Neon cache copies.');
  }

  const catalogReconcile = await reconcileCatalogD1WithNeon();

  const [commerce, customers, catalog] = await Promise.all([
    verifyCommerceD1Parity(),
    verifyCustomersD1Parity(),
    verifyCatalogD1Parity(),
  ]);

  if (!commerce.inSync || !customers.inSync || !catalog.inSync) {
    throw new Error(
      `Parity check failed before Neon purge: commerce=${commerce.inSync}, customers=${customers.inSync}, catalog=${catalog.inSync}`,
    );
  }

  const orderItems = await sql`DELETE FROM shopify_order_items RETURNING id`;
  const orders = await sql`DELETE FROM shopify_orders RETURNING id`;
  const fulfillments = await sql`DELETE FROM shopify_fulfillments RETURNING id`;
  const customersDeleted = await sql`DELETE FROM shopify_customers RETURNING id`;
  const variants = await sql`DELETE FROM shopify_product_variants RETURNING variant_id`;

  return {
    catalogReconcile,
    orderItemsDeleted: orderItems.length,
    ordersDeleted: orders.length,
    fulfillmentsDeleted: fulfillments.length,
    customersDeleted: customersDeleted.length,
    variantsDeleted: variants.length,
  };
};

export const getSubscriberKpis = async (shopDomain: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  const { audienceRead, d1CountSubscribers, d1CountActiveDeliverableSubscribers } = await import(
    '@/lib/server/integrations/d1-audience'
  );

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const since7 = new Date(now - 7 * day).toISOString();
  const since14 = new Date(now - 14 * day).toISOString();

  const totalSubscriberRecords = await audienceRead<number>({
    label: 'kpis.totalRecords',
    key: (n) => String(n),
    neon: async () => {
      const rows = await sql`
        SELECT COUNT(*)::BIGINT AS count
        FROM subscribers
        WHERE shop_domain = ${shopDomain}
      `;
      return Number(rows[0]?.count ?? 0);
    },
    d1: async () => d1CountSubscribers(shopDomain),
  });

  const totalSubscribers = await audienceRead<number>({
    label: 'kpis.active',
    key: (n) => String(n),
    neon: async () => {
      const rows = await sql`
        SELECT COUNT(DISTINCT s.id)::BIGINT AS count
        FROM subscribers s
        JOIN subscriber_tokens t ON t.subscriber_id = s.id AND t.shop_domain = s.shop_domain
        WHERE s.shop_domain = ${shopDomain}
          AND t.status = 'active'
          AND (
            (
              COALESCE(t.token_type, 'fcm') = 'vapid'
              AND t.vapid_endpoint IS NOT NULL AND TRIM(t.vapid_endpoint) <> ''
              AND t.vapid_p256dh IS NOT NULL AND TRIM(t.vapid_p256dh) <> ''
              AND t.vapid_auth IS NOT NULL AND TRIM(t.vapid_auth) <> ''
            )
            OR (
              COALESCE(t.token_type, 'fcm') <> 'vapid'
              AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
            )
          )
      `;
      return Number(rows[0]?.count ?? 0);
    },
    d1: async () => d1CountActiveDeliverableSubscribers(shopDomain),
  });

  const newSubscribersLast7Days = await audienceRead<number>({
    label: 'kpis.new7d',
    key: (n) => String(n),
    neon: async () => {
      const rows = await sql`
        SELECT COUNT(DISTINCT s.id)::BIGINT AS count
        FROM subscribers s
        JOIN subscriber_tokens t ON t.subscriber_id = s.id AND t.shop_domain = s.shop_domain
        WHERE s.shop_domain = ${shopDomain}
          AND s.created_at >= NOW() - INTERVAL '7 days'
          AND t.status = 'active'
          AND (
            (
              COALESCE(t.token_type, 'fcm') = 'vapid'
              AND t.vapid_endpoint IS NOT NULL AND TRIM(t.vapid_endpoint) <> ''
              AND t.vapid_p256dh IS NOT NULL AND TRIM(t.vapid_p256dh) <> ''
              AND t.vapid_auth IS NOT NULL AND TRIM(t.vapid_auth) <> ''
            )
            OR (
              COALESCE(t.token_type, 'fcm') <> 'vapid'
              AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
            )
          )
      `;
      return Number(rows[0]?.count ?? 0);
    },
    d1: async () => d1CountActiveDeliverableSubscribers(shopDomain, { createdSince: since7 }),
  });

  const previousPeriodCount = await audienceRead<number>({
    label: 'kpis.prev7d',
    key: (n) => String(n),
    neon: async () => {
      const rows = await sql`
        SELECT COUNT(DISTINCT s.id)::BIGINT AS count
        FROM subscribers s
        JOIN subscriber_tokens t ON t.subscriber_id = s.id AND t.shop_domain = s.shop_domain
        WHERE s.shop_domain = ${shopDomain}
          AND s.created_at >= NOW() - INTERVAL '14 days'
          AND s.created_at < NOW() - INTERVAL '7 days'
          AND t.status = 'active'
          AND (
            (
              COALESCE(t.token_type, 'fcm') = 'vapid'
              AND t.vapid_endpoint IS NOT NULL AND TRIM(t.vapid_endpoint) <> ''
              AND t.vapid_p256dh IS NOT NULL AND TRIM(t.vapid_p256dh) <> ''
              AND t.vapid_auth IS NOT NULL AND TRIM(t.vapid_auth) <> ''
            )
            OR (
              COALESCE(t.token_type, 'fcm') <> 'vapid'
              AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
            )
          )
      `;
      return Number(rows[0]?.count ?? 0);
    },
    d1: async () =>
      d1CountActiveDeliverableSubscribers(shopDomain, { createdSince: since14, createdBefore: since7 }),
  });

  const growthPercent = previousPeriodCount > 0
    ? ((newSubscribersLast7Days - previousPeriodCount) / previousPeriodCount) * 100
    : (newSubscribersLast7Days > 0 ? 100 : 0);

  return {
    totalSubscribers,
    totalSubscriberRecords,
    activeSubscribers: totalSubscribers,
    newSubscribersLast7Days,
    growthPercent,
  };
};

export const listSubscribers = async (shopDomain: string, limit = 100, offset = 0, sortOrder: SubscriberSortOrder = 'desc') => {
  await ensureSchema();
  const sql = getNeonSql();

  const safeLimit = Math.min(Math.max(limit, 1), 500);
  const safeOffset = Math.max(offset, 0);

  const { audienceRead, d1ListSubscribers, d1CountSubscribers } = await import(
    '@/lib/server/integrations/d1-audience'
  );

  type ListRow = {
    external_id: string | null;
    created_at: string | null;
    web_browser: string;
    os_name: string;
    device_used: string;
    city: string | null;
    country: string | null;
  };

  const rows = await audienceRead<ListRow[]>({
    label: `listSubscribers.${sortOrder}`,
    key: (list) =>
      list
        .map(
          (r) =>
            `${r.external_id ?? ''}|${r.created_at ? new Date(String(r.created_at)).getTime() : 0}|${r.web_browser}|${r.os_name}|${r.device_used}|${r.city ?? ''}|${r.country ?? ''}`,
        )
        .join(';'),
    neon: async () => {
      const result = sortOrder === 'asc'
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
      return result as unknown as ListRow[];
    },
    d1: async () => d1ListSubscribers(shopDomain, safeLimit, safeOffset, sortOrder),
  });

  const total = await audienceRead<number>({
    label: 'listSubscribers.total',
    key: (n) => String(n),
    neon: async () => {
      const totalRows = await sql`
        SELECT COUNT(*)::BIGINT AS count
        FROM subscribers
        WHERE shop_domain = ${shopDomain}
      `;
      return Number(totalRows[0]?.count ?? 0);
    },
    d1: async () => d1CountSubscribers(shopDomain),
  });

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

  const { audienceRead, d1GetSubscriberBreakdown } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  const shadowKey = (result: { browsers: Array<{ name: string; value: number }>; platforms: Array<{ name: string; value: number }> }) =>
    JSON.stringify({
      b: result.browsers.map((r) => `${r.name}:${r.value}`),
      p: result.platforms.map((r) => `${r.name}:${r.value}`),
    });

  return audienceRead<{
    browsers: Array<{ name: string; value: number }>;
    platforms: Array<{ name: string; value: number }>;
  }>({
    label: 'getSubscriberBreakdown',
    key: shadowKey,
    neon: async () => {
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
    },
    d1: async () => d1GetSubscriberBreakdown(shopDomain, safeLimit),
  });
};

export const getSubscriberLocationBreakdown = async (shopDomain: string, limit = 8) => {
  await ensureSchema();
  const sql = getNeonSql();
  const safeLimit = Math.min(Math.max(limit, 1), 20);

  const { audienceRead, d1GetSubscriberLocationBreakdown } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  const shadowKey = (result: { countries: Array<{ name: string; value: number }>; cities: Array<{ name: string; value: number }> }) =>
    JSON.stringify({
      c: result.countries.map((r) => `${r.name}:${r.value}`),
      t: result.cities.map((r) => `${r.name}:${r.value}`),
    });

  return audienceRead<{
    countries: Array<{ name: string; value: number }>;
    cities: Array<{ name: string; value: number }>;
  }>({
    label: 'getSubscriberLocationBreakdown',
    key: shadowKey,
    neon: async () => {
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
    },
    d1: async () => d1GetSubscriberLocationBreakdown(shopDomain, safeLimit),
  });
};

export const getSubscriberGrowth = async (
  shopDomain: string,
  from?: Date | null,
  to?: Date | null,
) => {
  await ensureSchema();
  const sql = getNeonSql();

  const { isD1AudienceReadActive, d1GetEarliestSubscriberCreatedAt, d1GetSubscriberGrowthCounts } =
    await import('@/lib/server/integrations/d1-audience');
  const readActive = isD1AudienceReadActive();

  const end = to ?? new Date();
  let start = from ?? null;

  if (!start) {
    let earliest: unknown;
    if (readActive) {
      earliest = await d1GetEarliestSubscriberCreatedAt(shopDomain);
    } else {
      const earliestRows = await sql`
        SELECT MIN(created_at) AS earliest
        FROM subscribers
        WHERE shop_domain = ${shopDomain}
      `;
      earliest = earliestRows[0]?.earliest;
    }
    start = earliest
      ? new Date(String(earliest))
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  const rangeStart = start <= end ? start : end;
  const rangeEnd = start <= end ? end : start;

  let points: SubscriberGrowthPoint[];

  if (readActive) {
    // Bucket new subscribers by UTC calendar day in D1, then fill the full day
    // range (including zero days) in app code to mirror generate_series.
    const counts = await d1GetSubscriberGrowthCounts(
      shopDomain,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
    );
    const byDay = new Map(counts.map((row) => [row.day, row.count]));
    points = [];
    const cursor = new Date(
      Date.UTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), rangeStart.getUTCDate()),
    );
    const endDay = new Date(
      Date.UTC(rangeEnd.getUTCFullYear(), rangeEnd.getUTCMonth(), rangeEnd.getUTCDate()),
    );
    while (cursor <= endDay) {
      const label = cursor.toISOString().slice(0, 10);
      points.push({ date: label, subscribers: byDay.get(label) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  } else {
    const rows = await sql`
      SELECT
        gs.day::date AS day,
        COALESCE(COUNT(DISTINCT s.id), 0)::BIGINT AS subscribers
      FROM generate_series(${rangeStart}::timestamptz, ${rangeEnd}::timestamptz, interval '1 day') AS gs(day)
      LEFT JOIN subscribers s
        ON s.shop_domain = ${shopDomain}
        AND s.created_at >= gs.day
        AND s.created_at < gs.day + interval '1 day'
        AND EXISTS (
          SELECT 1
          FROM subscriber_tokens t
          WHERE t.subscriber_id = s.id
            AND t.shop_domain = s.shop_domain
            AND t.status = 'active'
            AND (
              (
                COALESCE(t.token_type, 'fcm') = 'vapid'
                AND t.vapid_endpoint IS NOT NULL AND TRIM(t.vapid_endpoint) <> ''
                AND t.vapid_p256dh IS NOT NULL AND TRIM(t.vapid_p256dh) <> ''
                AND t.vapid_auth IS NOT NULL AND TRIM(t.vapid_auth) <> ''
              )
              OR (
                COALESCE(t.token_type, 'fcm') <> 'vapid'
                AND t.fcm_token IS NOT NULL AND TRIM(t.fcm_token) <> ''
              )
            )
        )
      GROUP BY gs.day
      ORDER BY gs.day ASC
    `;

    points = rows.map((row) => ({
      date: row?.day ? String(row.day) : '',
      subscribers: Number(row?.subscribers ?? 0),
    }));
  }

  return {
    from: rangeStart,
    to: rangeEnd,
    points,
    totalNewSubscribers: points.reduce((sum, item) => sum + item.subscribers, 0),
  };
};

export const createCampaign = async (input: CreateCampaignInput) => {
  await ensureSchema();
  const sql = getNeonSql();

  await ensureMerchant(input.shopDomain);

  const campaignId = randomUUID();
  const listImageUrl =
    pickCampaignBarImageUrl({
      imageUrl: input.imageUrl ?? null,
      windowsImageUrl: input.windowsImageUrl ?? null,
      macosImageUrl: input.macosImageUrl ?? null,
      androidImageUrl: input.androidImageUrl ?? null,
    }) ??
    input.imageUrl ??
    input.macosImageUrl ??
    input.windowsImageUrl ??
    input.androidImageUrl ??
    null;

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
      ${listImageUrl},
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

  const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
  void bumpCronWakeNow();

  return campaignRows[0];
};

export const updateCampaignDraft = async (input: CreateCampaignInput & { campaignId: string }) => {
  await ensureSchema();
  const sql = getNeonSql();

  const existing = await getCampaignById(input.shopDomain, input.campaignId);
  if (!existing) {
    throw new Error('Campaign not found.');
  }

  if (String(existing.status ?? '').toLowerCase() !== 'draft') {
    throw new Error('Only draft campaigns can be updated.');
  }

  const listImageUrl =
    pickCampaignBarImageUrl({
      imageUrl: input.imageUrl ?? null,
      windowsImageUrl: input.windowsImageUrl ?? null,
      macosImageUrl: input.macosImageUrl ?? null,
      androidImageUrl: input.androidImageUrl ?? null,
    }) ??
    input.imageUrl ??
    input.macosImageUrl ??
    input.windowsImageUrl ??
    input.androidImageUrl ??
    null;

  const campaignRows = await sql`
    UPDATE campaigns
    SET
      title = ${input.title},
      body = ${input.body},
      target_url = ${input.targetUrl ?? null},
      icon_url = ${input.iconUrl ?? null},
      image_url = ${listImageUrl},
      windows_image_url = ${input.windowsImageUrl ?? null},
      macos_image_url = ${input.macosImageUrl ?? null},
      android_image_url = ${input.androidImageUrl ?? null},
      action_buttons = ${JSON.stringify(input.actionButtons ?? [])}::jsonb,
      segment_id = ${input.segmentId ?? null},
      scheduled_at = ${input.scheduledAt ? new Date(input.scheduledAt) : null}
    WHERE id = ${input.campaignId}
      AND shop_domain = ${input.shopDomain}
      AND status = 'draft'
    RETURNING *
  `;

  if (!campaignRows[0]) {
    throw new Error('Failed to update draft campaign.');
  }

  return campaignRows[0];
};

export const deleteDraftCampaign = async (shopDomain: string, campaignId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const existing = await getCampaignById(shopDomain, campaignId);
  if (!existing) {
    throw new Error('Campaign not found.');
  }

  if (String(existing.status ?? '').toLowerCase() !== 'draft') {
    throw new Error('Only draft campaigns can be deleted.');
  }

  await sql`
    DELETE FROM campaigns
    WHERE id = ${campaignId}
      AND shop_domain = ${shopDomain}
      AND status = 'draft'
  `;

  return { ok: true as const };
};

export const listCampaigns = async (shopDomain: string, limit = 50) => {
  await ensureSchema();
  const sql = getNeonSql();

  return sql`
    SELECT
      c.*,
      cs.smart_send_enabled,
      cs.flash_sale_enabled AS schedule_flash_sale_enabled
    FROM campaigns c
    LEFT JOIN campaign_schedules cs ON cs.campaign_id = c.id
    WHERE c.shop_domain = ${shopDomain}
    ORDER BY c.created_at DESC
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

export const getCampaignWithDetails = async (shopDomain: string, campaignId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  const rows = await sql`
    SELECT
      c.*,
      cs.schedule_type,
      cs.send_at,
      cs.smart_send_enabled,
      cs.flash_sale_enabled AS schedule_flash_sale_enabled,
      cs.flash_sale_config
    FROM campaigns c
    LEFT JOIN campaign_schedules cs ON cs.campaign_id = c.id
    WHERE c.shop_domain = ${shopDomain}
      AND c.id = ${campaignId}
    LIMIT 1
  `;

  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return null;
  }

  const flashConfig = (row.flash_sale_config ?? {}) as Record<string, unknown>;
  const scheduleFlashSale = Boolean(row.schedule_flash_sale_enabled);

  return {
    ...row,
    flash_sale_enabled: Boolean(row.flash_sale_enabled) || scheduleFlashSale,
    flash_sale_config: Object.keys(flashConfig).length > 0 ? flashConfig : null,
  };
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

export const getAnalyticsStats = async (shopDomain: string, from?: Date | null, to?: Date | null) => {
  await ensureSchema();
  const sql = getNeonSql();

  // No explicit `from` means "all time": scan from the epoch so the date filters
  // include every retained row, and fold in the archived baseline of already-pruned
  // automation rows (campaign totals live durably on the campaigns row, so summing
  // all campaigns is already all-time-correct). A bounded window keeps the existing
  // behavior exactly (archived is only added for all-time, so displayed numbers for
  // any dated range are unchanged).
  const isAllTime = !from;
  const start = isAllTime ? new Date(0) : from!;
  const end = to ?? new Date();

  const {
    getAutomationAggregateForAnalytics,
    getTopAutomationRulesByRevenue,
    getAutomationClicksByRule,
  } = await import('@/lib/server/integrations/deliveries-data');

  const [
    campaignKpiRows,
    autoAggregate,
    subscriberRows,
    dailyRevenueRows,
    topCampaignRows,
    topAutoRows,
    topAutoClickRows,
    archivedAutoRows,
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
    getAutomationAggregateForAnalytics(shopDomain, start, end),
    (async () => {
      const { isD1AudienceReadActive, d1CountSubscribersCreatedBetween } = await import(
        '@/lib/server/integrations/d1-audience'
      );
      if (isD1AudienceReadActive()) {
        const count = await d1CountSubscribersCreatedBetween(
          shopDomain,
          start.toISOString(),
          end.toISOString(),
        );
        return [{ count }];
      }
      return sql`
        SELECT COUNT(*)::BIGINT AS count
        FROM subscribers
        WHERE shop_domain = ${shopDomain}
          AND created_at >= ${start} AND created_at <= ${end}
      `;
    })(),
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
    isAllTime
      ? getTopAutomationRulesByRevenue(shopDomain, start, end)
      : getTopAutomationRulesByRevenue(shopDomain, start, end, 5),
    getAutomationClicksByRule(shopDomain, start, end),
    // Archived baseline of already-pruned automation rows (per rule). Only needed
    // for all-time; a bounded range is served purely from retained detail.
    isAllTime
      ? sql`
          SELECT
            rule_key,
            archived_impressions,
            archived_clicks,
            archived_revenue_cents
          FROM automation_rule_stats
          WHERE shop_domain = ${shopDomain}
        `
      : (Promise.resolve([]) as unknown as ReturnType<typeof sql>),
  ]);

  const clicksByRule = new Map(topAutoClickRows.map((r) => [String(r.rule_key), Number(r.clicks ?? 0)]));

  // Fold the archived (pruned) baseline into the automation aggregates so all-time
  // stats stay permanent even after raw detail rows are deleted. Empty for any
  // bounded range, so dated queries are byte-for-byte unchanged.
  const archivedByRule = new Map(
    archivedAutoRows.map((r) => [
      String(r.rule_key),
      {
        impressions: Number(r.archived_impressions ?? 0),
        clicks: Number(r.archived_clicks ?? 0),
        revenueCents: Number(r.archived_revenue_cents ?? 0),
      },
    ]),
  );
  let archivedAutoImpressions = 0;
  let archivedAutoClicks = 0;
  let archivedAutoRevenueCents = 0;
  for (const v of archivedByRule.values()) {
    archivedAutoImpressions += v.impressions;
    archivedAutoClicks += v.clicks;
    archivedAutoRevenueCents += v.revenueCents;
  }

  const campaignImpressions = Number(campaignKpiRows[0]?.impressions ?? 0);
  const campaignClicks = Number(campaignKpiRows[0]?.clicks ?? 0);
  const campaignRevenueCents = Number(campaignKpiRows[0]?.revenue_cents ?? 0);

  const autoImpressions = autoAggregate.impressions + archivedAutoImpressions;
  const autoClicks = autoAggregate.clicks + archivedAutoClicks;
  const autoRevenueCents =
    autoAggregate.deliveryRevenueCents +
    autoAggregate.clickRevenueCents +
    archivedAutoRevenueCents;

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
    topAutomations: (() => {
      // Bounded range: unchanged — topAutoRows is already the top-5 by revenue and
      // archivedByRule is empty.
      if (!isAllTime) {
        return topAutoRows.map((r) => ({
          ruleKey: String(r.rule_key),
          name: ruleKeyLabels[String(r.rule_key)] ?? String(r.rule_key),
          impressions: Number(r.impressions ?? 0),
          clicks: clicksByRule.get(String(r.rule_key)) ?? 0,
          revenueCents: Number(r.revenue_cents ?? 0),
        }));
      }
      // All-time: combine live detail with the archived baseline per rule, then rank.
      const combined = new Map<string, { impressions: number; clicks: number; revenueCents: number }>();
      const ensure = (key: string) => {
        let entry = combined.get(key);
        if (!entry) {
          entry = { impressions: 0, clicks: 0, revenueCents: 0 };
          combined.set(key, entry);
        }
        return entry;
      };
      for (const r of topAutoRows) {
        const entry = ensure(String(r.rule_key));
        entry.impressions += Number(r.impressions ?? 0);
        entry.revenueCents += Number(r.revenue_cents ?? 0);
      }
      for (const [key, clicks] of clicksByRule.entries()) {
        ensure(key).clicks += clicks;
      }
      for (const [key, v] of archivedByRule.entries()) {
        const entry = ensure(key);
        entry.impressions += v.impressions;
        entry.clicks += v.clicks;
        entry.revenueCents += v.revenueCents;
      }
      return Array.from(combined.entries())
        .map(([ruleKey, v]) => ({
          ruleKey,
          name: ruleKeyLabels[ruleKey] ?? ruleKey,
          impressions: v.impressions,
          clicks: v.clicks,
          revenueCents: v.revenueCents,
        }))
        .sort((a, b) => b.revenueCents - a.revenueCents)
        .slice(0, 5);
    })(),
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

type CampaignDeliveryInsertRow = {
  campaignId: string;
  shopDomain: string;
  subscriberId: number;
  tokenId: number;
  externalId?: string | null;
  userAgent?: string | null;
  messageId: string | null;
};

const claimCampaignDeliverySlots = async (
  _sql: ReturnType<typeof getNeonSql>,
  rows: CampaignDeliveryInsertRow[],
) => {
  const { claimCampaignDeliverySlots: claim } = await import(
    '@/lib/server/integrations/deliveries-data'
  );
  return claim(rows);
};

const updateCampaignDeliveryMessageIds = async (
  _sql: ReturnType<typeof getNeonSql>,
  campaignId: string,
  updates: Array<{ subscriberId: number; messageId: string | null }>,
) => {
  const { updateCampaignDeliveryMessageIds: update } = await import(
    '@/lib/server/integrations/deliveries-data'
  );
  return update(campaignId, updates);
};

const releaseCampaignDeliveryClaims = async (
  _sql: ReturnType<typeof getNeonSql>,
  campaignId: string,
  subscriberIds: number[],
) => {
  const { releaseCampaignDeliveryClaims: release } = await import(
    '@/lib/server/integrations/deliveries-data'
  );
  return release(campaignId, subscriberIds);
};

export const sendCampaign = async (
  shopDomain: string,
  campaignId: string,
  options?: { maxBatches?: number },
) => {
  const { assertCanSendNotifications } = await import('@/lib/server/billing/merchant-billing');

  await ensureSchema();
  const sql = getNeonSql();
  const maxBatches = Math.max(1, Math.min(Number(options?.maxBatches ?? Number.MAX_SAFE_INTEGER), 2000));

  const campaignRows = await sql`
    UPDATE campaigns
    SET
      status = 'sending',
      sent_at = COALESCE(sent_at, NOW())
    WHERE id = ${campaignId}
      AND shop_domain = ${shopDomain}
      AND status IN ('draft', 'scheduled', 'queued', 'sending')
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

    throw new Error(`Campaign cannot be sent from status '${existing.status ?? 'unknown'}'.`);
  }

  let recipients = dedupeRecipientsBySubscriber(
    await resolveCampaignAudience(shopDomain, campaign.segment_id, campaignId),
  );

  const scheduleMeta = await loadCampaignScheduleMeta(sql, campaignId, shopDomain);
  if (scheduleMeta?.flash_sale_enabled) {
    if (scheduleMeta.flash_sale_ends_at) {
      const endsAt = new Date(scheduleMeta.flash_sale_ends_at);
      if (!Number.isNaN(endsAt.getTime()) && endsAt.getTime() <= Date.now()) {
        await sql`
          UPDATE campaigns
          SET status = 'sent', sent_at = COALESCE(sent_at, NOW())
          WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
        `;
        throw new Error('Flash sale has expired.');
      }
    }

    campaign.body = buildFlashSaleNotificationBody(
      campaign.body,
      scheduleMeta.flash_sale_config,
      scheduleMeta.flash_sale_enabled,
    );
    await sql`
      UPDATE campaigns
      SET body = ${campaign.body}
      WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
    `;
  }

  const totalAudienceBeforeSmartFilter = recipients.length;
  if (scheduleMeta?.smart_send_enabled && recipients.length > 0) {
    const currentHour = new Date().getHours();
    recipients = await filterRecipientsForSmartDeliveryHour(sql, shopDomain, recipients, currentHour);

    if (recipients.length === 0) {
      await sql`
        UPDATE campaigns
        SET status = 'queued', target_recipient_count = ${totalAudienceBeforeSmartFilter}
        WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
      `;

      const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
      void bumpCronWakeNow();

      return {
        successCount: 0,
        failureCount: 0,
        recipientCount: totalAudienceBeforeSmartFilter,
        completed: false,
        remainingRecipients: totalAudienceBeforeSmartFilter,
      };
    }
  }

  const previousStatus = campaign.status === 'sending' ? 'draft' : campaign.status;

  const { getDeliveredSubscriberIdsForCampaign, deleteUnsentCampaignDeliveries, countCampaignDeliveries, countSentCampaignDeliveries } =
    await import('@/lib/server/integrations/deliveries-data');

  const deliveredSubscriberIds = new Set(
    await getDeliveredSubscriberIdsForCampaign(campaignId, true),
  );

  recipients = recipients.filter(
    (recipient) => !deliveredSubscriberIds.has(Number(recipient.subscriber_id)),
  );

  await deleteUnsentCampaignDeliveries(campaignId, shopDomain);

  await sql`
    UPDATE campaigns
    SET target_recipient_count = ${recipients.length}
    WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
  `;

  await assertCanSendNotifications(shopDomain, Math.max(recipients.length, 1));

  if (recipients.length === 0) {
    const deliveredCount = await countCampaignDeliveries(campaignId, shopDomain);

    const alreadyDelivered = await countSentCampaignDeliveries(campaignId);

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
      SET status = 'sent', sent_at = COALESCE(sent_at, NOW()), delivery_count = 0
      WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
    `;

    const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
    void bumpCronWakeNow();

    return {
      successCount: 0,
      failureCount: 0,
      recipientCount: 0,
      completed: true,
      remainingRecipients: 0,
    };
  }

  try {
    const messaging = getFirebaseAdminMessaging();
    const { selectCampaignImageForDevice, absolutizeNotificationMediaUrl } = await import(
      '@/lib/server/push/fcm-web-push-message'
    );
    const { env } = await import('@/lib/config/env');
    const appBaseUrl = (env.SHOPIFY_ROOT_APP_URL || env.NEXT_PUBLIC_APP_URL || 'https://push-eagle.vercel.app').replace(
      /\/$/,
      '',
    );
    const chunkSize = 500;
    let successCount = 0;
    let failureCount = 0;
    let processedBatches = 0;
    let processedRecipients = 0;

    for (let i = 0; i < recipients.length; i += chunkSize) {
      if (processedBatches >= maxBatches) {
        break;
      }

      const chunkSuccessBaseline = successCount;
      const chunk = recipients.slice(i, i + chunkSize);
      const chunkWithPayload = chunk.map((item) => {
        const platformImage = absolutizeNotificationMediaUrl(
          selectCampaignImageForDevice(
            {
              imageUrl: campaign.image_url,
              windowsImageUrl: campaign.windows_image_url,
              macosImageUrl: campaign.macos_image_url,
              androidImageUrl: campaign.android_image_url,
            },
            (item as { platform?: string }).platform,
            (item as { user_agent?: string | null }).user_agent,
          ),
          appBaseUrl,
        );

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
        const primaryTrackUrl = buildCampaignClickTrackingUrl(trackedUrl, campaignId, shopDomain, item.external_id);
        const button1TrackUrl = buildCampaignClickTrackingUrl(firstButtonUrl, campaignId, shopDomain, item.external_id);
        const button2TrackUrl = buildCampaignClickTrackingUrl(secondButtonUrl, campaignId, shopDomain, item.external_id);

        return {
          item,
          platformImage,
          trackedUrl,
          firstButtonUrl,
          secondButtonUrl,
          primaryTrackUrl,
          button1TrackUrl,
          button2TrackUrl,
          actions,
        };
      });

      const fcmRecipients = chunkWithPayload.filter(({ item }) => {
        if (String((item as { token_type?: string | null }).token_type ?? 'fcm') === 'vapid') {
          return false;
        }
        return Boolean(String(item.fcm_token ?? '').trim());
      });
      const vapidRecipients = chunkWithPayload.filter(({ item }) => {
        if (String((item as { token_type?: string | null }).token_type ?? 'fcm') !== 'vapid') {
          return false;
        }
        return Boolean(
          String((item as { vapid_endpoint?: string | null }).vapid_endpoint ?? '').trim()
          && String((item as { vapid_p256dh?: string | null }).vapid_p256dh ?? '').trim()
          && String((item as { vapid_auth?: string | null }).vapid_auth ?? '').trim(),
        );
      });

      const claimRows: CampaignDeliveryInsertRow[] = chunkWithPayload.map(({ item }) => ({
        campaignId,
        shopDomain,
        subscriberId: Number(item.subscriber_id),
        tokenId: Number(item.token_id),
        externalId: item.external_id ? String(item.external_id) : null,
        userAgent: (item as { user_agent?: string | null }).user_agent
          ? String((item as { user_agent?: string | null }).user_agent)
          : null,
        messageId: null,
      }));
      const claimedSlots = await claimCampaignDeliverySlots(sql, claimRows);
      const claimedSubscriberIds = new Set(claimedSlots.map((slot) => slot.subscriberId));
      const claimedFcmRecipients = fcmRecipients.filter(({ item }) =>
        claimedSubscriberIds.has(Number(item.subscriber_id)),
      );
      const claimedVapidRecipients = vapidRecipients.filter(({ item }) =>
        claimedSubscriberIds.has(Number(item.subscriber_id)),
      );

      if (claimedFcmRecipients.length > 0) {
        const messages = claimedFcmRecipients.map(
          ({ item, platformImage, trackedUrl, firstButtonUrl, secondButtonUrl, primaryTrackUrl, button1TrackUrl, button2TrackUrl, actions }) =>
            buildFcmDataOnlyWebPushMessage({
              token: item.fcm_token,
              title: campaign.title,
              body: campaign.body,
              iconUrl: absolutizeNotificationMediaUrl(campaign.icon_url, appBaseUrl),
              imageUrl: platformImage,
              linkUrl: trackedUrl,
              campaignId,
              shopDomain,
              primaryUrl: trackedUrl ?? '',
              button1Url: firstButtonUrl,
              button2Url: secondButtonUrl,
              trackPrimaryUrl: primaryTrackUrl,
              trackButton1Url: button1TrackUrl,
              trackButton2Url: button2TrackUrl,
              action1Title: actions[0]?.title ?? '',
              action2Title: actions[1]?.title ?? '',
              tag: campaignId,
            }),
        );

        const multicast = await messaging.sendEach(messages);

        successCount += multicast.successCount;
        failureCount += multicast.failureCount;

        const messageUpdates: Array<{ subscriberId: number; messageId: string | null }> = [];
        const failedClaimReleases: number[] = [];
        const revokedTokenIds: number[] = [];

        for (let index = 0; index < multicast.responses.length; index += 1) {
          const response = multicast.responses[index];
          const recipient = claimedFcmRecipients[index]?.item;
          if (!recipient) {
            continue;
          }

          const subscriberId = Number(recipient.subscriber_id);

          if (response.success) {
            messageUpdates.push({
              subscriberId,
              messageId: response.messageId ?? null,
            });
            continue;
          }

          failedClaimReleases.push(subscriberId);

          const code = response.error?.code ?? '';
          if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
            revokedTokenIds.push(Number(recipient.token_id));
          }
        }

        await updateCampaignDeliveryMessageIds(sql, campaignId, messageUpdates);
        await releaseCampaignDeliveryClaims(sql, campaignId, failedClaimReleases);

        for (const tokenId of revokedTokenIds) {
          await sql`
            UPDATE subscriber_tokens
            SET status = 'revoked', updated_at = NOW()
            WHERE id = ${tokenId}
          `;
        }
        if (revokedTokenIds.length > 0) {
          const { isD1AudienceWriteEnabled, d1UpdateTokenStatus } = await import(
            '@/lib/server/integrations/d1-audience'
          );
          if (isD1AudienceWriteEnabled()) {
            for (const tokenId of revokedTokenIds) {
              await d1UpdateTokenStatus(Number(tokenId), 'revoked');
            }
          }
        }
      }

      const vapidRevokedTokenIds: number[] = [];

      for (const { item, platformImage, trackedUrl, firstButtonUrl, secondButtonUrl, actions, primaryTrackUrl, button1TrackUrl, button2TrackUrl } of claimedVapidRecipients) {
        const subscriberId = Number(item.subscriber_id);

        try {
          const endpoint = String((item as { vapid_endpoint?: string | null }).vapid_endpoint ?? '');
          const p256dh = String((item as { vapid_p256dh?: string | null }).vapid_p256dh ?? '');
          const auth = String((item as { vapid_auth?: string | null }).vapid_auth ?? '');

          if (!endpoint || !p256dh || !auth) {
            failureCount += 1;
            await releaseCampaignDeliveryClaims(sql, campaignId, [subscriberId]);
            continue;
          }

          const vapidMessageId = await sendVapidPushNotification(
            { endpoint, keys: { p256dh, auth } },
            {
              title: campaign.title,
              body: campaign.body,
              icon: absolutizeNotificationMediaUrl(campaign.icon_url, appBaseUrl),
              image: platformImage,
              url: trackedUrl,
              actions,
              button1Url: firstButtonUrl,
              button2Url: secondButtonUrl,
              trackPrimaryUrl: primaryTrackUrl,
              trackButton1Url: button1TrackUrl,
              trackButton2Url: button2TrackUrl,
            },
          );

          successCount += 1;

          await updateCampaignDeliveryMessageIds(sql, campaignId, [
            {
              subscriberId,
              messageId: vapidMessageId,
            },
          ]);
        } catch (error) {
          failureCount += 1;
          await releaseCampaignDeliveryClaims(sql, campaignId, [subscriberId]);

          const message = error instanceof Error ? error.message : String(error ?? '');
          if (message.includes('410') || message.includes('404') || message.toLowerCase().includes('unsub')) {
            vapidRevokedTokenIds.push(Number(item.token_id));
          }
        }
      }

      for (const tokenId of vapidRevokedTokenIds) {
        await sql`
          UPDATE subscriber_tokens
          SET status = 'revoked', updated_at = NOW()
          WHERE id = ${tokenId}
        `;
      }
      if (vapidRevokedTokenIds.length > 0) {
        const { isD1AudienceWriteEnabled, d1UpdateTokenStatus } = await import(
          '@/lib/server/integrations/d1-audience'
        );
        if (isD1AudienceWriteEnabled()) {
          for (const tokenId of vapidRevokedTokenIds) {
            await d1UpdateTokenStatus(Number(tokenId), 'revoked');
          }
        }
      }

      processedRecipients += chunk.length;
      processedBatches += 1;

      const chunkImpressions = successCount - chunkSuccessBaseline;
      if (chunkImpressions > 0) {
        const { incrementBillingImpressions } = await import('@/lib/server/billing/merchant-billing');
        await incrementBillingImpressions(shopDomain, chunkImpressions);
      }

      await sql`
        UPDATE campaigns
        SET delivery_count = (
          SELECT COUNT(*)::INT
          FROM campaign_deliveries
          WHERE campaign_id = ${campaignId}
            AND fcm_message_id IS NOT NULL
        )
        WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
      `;
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

      const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
      void bumpCronWakeNow();

      return {
        successCount,
        failureCount,
        recipientCount: recipients.length,
        completed: false,
        remainingRecipients,
      };
    }

    const deliveredCount = await countSentCampaignDeliveries(campaignId);

    if (scheduleMeta?.smart_send_enabled) {
      const fullAudience = dedupeRecipientsBySubscriber(
        await resolveCampaignAudience(shopDomain, campaign.segment_id, campaignId),
      );

      if (deliveredCount < fullAudience.length) {
        await sql`
          UPDATE campaigns
          SET
            status = 'queued',
            target_recipient_count = ${fullAudience.length},
            delivery_count = ${deliveredCount}
          WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
        `;

        const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
        void bumpCronWakeNow();

        return {
          successCount,
          failureCount,
          recipientCount: fullAudience.length,
          completed: false,
          remainingRecipients: Math.max(fullAudience.length - deliveredCount, 0),
        };
      }
    }

    if (deliveredCount === 0 && recipients.length > 0) {
      await sql`
        UPDATE campaigns
        SET status = 'queued', delivery_count = 0
        WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
      `;

      const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
      void bumpCronWakeNow();

      return {
        successCount,
        failureCount,
        recipientCount: recipients.length,
        completed: false,
        remainingRecipients: recipients.length,
      };
    }

    await sql`
      UPDATE campaigns
      SET
        status = 'sent',
        sent_at = NOW(),
        delivery_count = ${deliveredCount}
      WHERE id = ${campaignId}
    `;

    const { invalidateShopDashboardCaches } = await import('@/lib/server/cache/api-kv-cache');
    void invalidateShopDashboardCaches(shopDomain);

    return {
      successCount,
      failureCount,
      recipientCount: recipients.length,
      completed: true,
      remainingRecipients: 0,
    };
  } catch (error) {
    const partialRows = await sql`
      SELECT COUNT(*)::INT AS count
      FROM campaign_deliveries
      WHERE campaign_id = ${campaignId}
        AND fcm_message_id IS NOT NULL
    `;
    const partialDelivered = Number(partialRows[0]?.count ?? 0);

    if (partialDelivered > 0) {
      await sql`
        UPDATE campaigns
        SET
          status = 'queued',
          delivery_count = ${partialDelivered}
        WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
      `;

      const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
      void bumpCronWakeNow();

      return {
        successCount: partialDelivered,
        failureCount: 0,
        recipientCount: recipients.length,
        completed: false,
        remainingRecipients: Math.max(recipients.length - partialDelivered, 0),
      };
    }

    await sql`
      UPDATE campaigns
      SET status = 'queued'
      WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
    `;

    const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
    void bumpCronWakeNow();

    return {
      successCount: 0,
      failureCount: 0,
      recipientCount: recipients.length,
      completed: false,
      remainingRecipients: recipients.length,
    };
  }
};

export const requeueCampaignForDelivery = async (shopDomain: string, campaignId: string) => {
  await ensureSchema();
  const sql = getNeonSql();

  await sql`
    UPDATE campaigns
    SET status = 'queued'
    WHERE id = ${campaignId}
      AND shop_domain = ${shopDomain}
      AND status IN ('draft', 'sending', 'queued')
  `;

  const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
  void bumpCronWakeNow();
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

  const { isD1AudienceWriteEnabled, d1RevokeAllTokensForShop } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  if (isD1AudienceWriteEnabled()) {
    await d1RevokeAllTokensForShop(shopDomain);
  }
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
    SELECT attribution_model, attribution_credit_mode, click_window_days, impression_window_days
    FROM merchant_settings
    WHERE shop_domain = ${shopDomain}
    LIMIT 1
  `;

  return {
    attributionModel: (settingsRows[0]?.attribution_model as 'click' | 'impression') ?? 'impression',
    attributionCreditMode: (settingsRows[0]?.attribution_credit_mode as 'last_touch' | 'all_touches') ?? 'last_touch',
    clickWindowDays: Number(settingsRows[0]?.click_window_days ?? 7),
    impressionWindowDays: Number(settingsRows[0]?.impression_window_days ?? 7),
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

  try {
    const { clearStorefrontConfigCache } = await import('@/lib/server/cache/storefront-config-cache');
    void clearStorefrontConfigCache(input.shopDomain);
  } catch {
    // best-effort cache invalidation
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
    INSERT INTO merchant_settings (
      shop_domain,
      attribution_model,
      attribution_credit_mode,
      click_window_days,
      impression_window_days,
      updated_at
    )
    VALUES (
      ${input.shopDomain},
      ${input.attributionModel},
      ${input.attributionCreditMode},
      ${input.clickWindowDays},
      ${input.impressionWindowDays},
      NOW()
    )
    ON CONFLICT (shop_domain)
    DO UPDATE SET
      attribution_model = EXCLUDED.attribution_model,
      attribution_credit_mode = EXCLUDED.attribution_credit_mode,
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

  const deliveryRows = await (async () => {
    const { getWelcomeDeliveryStatsByStep } = await import(
      '@/lib/server/integrations/deliveries-data'
    );
    return getWelcomeDeliveryStatsByStep(shopDomain);
  })();

  const staleProcessingRows = await sql`
    SELECT COUNT(*)::INT AS stale_processing
    FROM automation_jobs
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
      AND status = 'processing'
        AND updated_at < NOW() - INTERVAL '2 minutes'
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
    inferredIssues.push('Stale processing jobs detected (>2m); worker interruption/backpressure likely occurred.');
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
      delayMinutes: Number(welcomeConfig.steps['reminder-2'].delayMinutes ?? 0),
      targetUrl: welcomeConfig.steps['reminder-2'].targetUrl ?? null,
      actionButtons: welcomeConfig.steps['reminder-2'].actionButtons ?? [],
    },
    'reminder-3': {
      enabled: Boolean(welcomeConfig.steps['reminder-3'].enabled),
      delayMinutes: Number(welcomeConfig.steps['reminder-3'].delayMinutes ?? 0),
      targetUrl: welcomeConfig.steps['reminder-3'].targetUrl ?? null,
      actionButtons: welcomeConfig.steps['reminder-3'].actionButtons ?? [],
    },
  };

  const lagSamples = (recentRows as Array<Record<string, unknown>>)
    .filter((row) => (String(row.step_key ?? '') === 'reminder-2' || String(row.step_key ?? '') === 'reminder-3') && row.sent_at && row.due_at)
    .map((row) => {
      const sentAt = new Date(String(row.sent_at)).getTime();
      const dueAt = new Date(String(row.due_at)).getTime();
      const lagMinutes = Math.max(0, Math.round(((sentAt - dueAt) / 60000) * 100) / 100);
      return {
        stepKey: String(row.step_key ?? ''),
        lagMinutes,
      };
    })
    .filter((sample) => Number.isFinite(sample.lagMinutes));

  const lagMinutesByStep = {
    reminder2: lagSamples.filter((sample) => sample.stepKey === 'reminder-2').map((sample) => sample.lagMinutes),
    reminder3: lagSamples.filter((sample) => sample.stepKey === 'reminder-3').map((sample) => sample.lagMinutes),
  };

  const average = (values: number[]) => {
    if (values.length === 0) {
      return null;
    }
    return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
  };

  const max = (values: number[]) => {
    if (values.length === 0) {
      return null;
    }
    return Math.round(Math.max(...values) * 100) / 100;
  };

  const delayedReminder2 = lagMinutesByStep.reminder2.filter((value) => value >= 2).length;
  const delayedReminder3 = lagMinutesByStep.reminder3.filter((value) => value >= 2).length;
  if (delayedReminder2 > 0 || delayedReminder3 > 0) {
    inferredIssues.push(
      `Observed delayed sends: reminder-2 delayed >=2m ${delayedReminder2} times, reminder-3 delayed >=2m ${delayedReminder3} times.`,
    );
  }

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
    sendLagDiagnostics: {
      reminder2: {
        sampleCount: lagMinutesByStep.reminder2.length,
        averageLagMinutes: average(lagMinutesByStep.reminder2),
        maxLagMinutes: max(lagMinutesByStep.reminder2),
      },
      reminder3: {
        sampleCount: lagMinutesByStep.reminder3.length,
        averageLagMinutes: average(lagMinutesByStep.reminder3),
        maxLagMinutes: max(lagMinutesByStep.reminder3),
      },
    },
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
  const { deleteWelcomeAutomationDeliveries } = await import(
    '@/lib/server/integrations/deliveries-data'
  );

  const cleared = await deleteWelcomeAutomationDeliveries(shopDomain);

  const jobRows = await sql`
    DELETE FROM automation_jobs
    WHERE shop_domain = ${shopDomain}
      AND rule_key = 'welcome_subscriber'
    RETURNING id
  `;

  return {
    clearedJobs: jobRows.length,
    clearedDeliveries: cleared.deliveries,
    clearedClicks: cleared.clicks,
    clearedAt: new Date().toISOString(),
  };
};

export const trackCampaignClick = async (input: TrackCampaignClickInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  const normalizedExternalId = input.externalId?.trim() || null;
  const {
    insertCampaignClick,
    markCampaignDeliveryClicked,
  } = await import('@/lib/server/integrations/deliveries-data');

  const subscriberId = input.externalId
    ? await (async () => {
        const { audienceRead, d1GetSubscriberIdByExternalId } = await import(
          '@/lib/server/integrations/d1-audience'
        );
        return audienceRead<number | null>({
          label: 'trackCampaignClick.subscriberId',
          key: (v) => String(v ?? 'null'),
          neon: async () => {
            const rows = await sql`
              SELECT id
              FROM subscribers
              WHERE shop_domain = ${input.shopDomain} AND external_id = ${input.externalId}
              LIMIT 1
            `;
            return rows[0]?.id ? Number(rows[0].id) : null;
          },
          d1: async () =>
            d1GetSubscriberIdByExternalId(input.shopDomain, String(input.externalId)),
        });
      })()
    : null;

  await insertCampaignClick({
    campaignId: input.campaignId,
    shopDomain: input.shopDomain,
    subscriberId,
    externalId: normalizedExternalId,
    targetUrl: input.targetUrl,
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null,
    referrer: input.referrer ?? null,
  });

  await markCampaignDeliveryClicked({
    campaignId: input.campaignId,
    shopDomain: input.shopDomain,
    externalId: normalizedExternalId,
    subscriberId,
  });

  await sql`
    UPDATE campaigns
    SET click_count = click_count + 1
    WHERE id = ${input.campaignId} AND shop_domain = ${input.shopDomain}
  `;
};

export const trackAutomationClick = async (input: TrackAutomationClickInput) => {
  await ensureSchema();
  const sql = getNeonSql();
  const normalizedExternalId = input.externalId?.trim() || null;
  const {
    insertAutomationClick,
    markAutomationDeliveryClicked,
  } = await import('@/lib/server/integrations/deliveries-data');

  const subscriberId = input.externalId
    ? await (async () => {
        const { audienceRead, d1GetSubscriberIdByExternalId } = await import(
          '@/lib/server/integrations/d1-audience'
        );
        return audienceRead<number | null>({
          label: 'trackAutomationClick.subscriberId',
          key: (v) => String(v ?? 'null'),
          neon: async () => {
            const rows = await sql`
              SELECT id
              FROM subscribers
              WHERE shop_domain = ${input.shopDomain} AND external_id = ${input.externalId}
              LIMIT 1
            `;
            return rows[0]?.id ? Number(rows[0].id) : null;
          },
          d1: async () =>
            d1GetSubscriberIdByExternalId(input.shopDomain, String(input.externalId)),
        });
      })()
    : null;

  await insertAutomationClick({
    ruleKey: input.ruleKey,
    shopDomain: input.shopDomain,
    subscriberId,
    externalId: input.externalId ?? null,
    targetUrl: input.targetUrl,
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null,
    referrer: input.referrer ?? null,
  });

  await markAutomationDeliveryClicked({
    shopDomain: input.shopDomain,
    ruleKey: input.ruleKey,
    externalId: normalizedExternalId,
  });
};

export const recordAttributedConversion = async (input: RecordConversionInput) => {
  await ensureSchema();
  const sql = getNeonSql();

  const settings = await getAttributionSettings(input.shopDomain);
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  const normalizedEmail = input.email?.trim().toLowerCase() ?? null;
  const normalizedCustomerId = input.customerId?.trim() || null;
  const externalIdCartToken = (() => {
    const external = String(input.externalId ?? '').trim();
    if (!external.startsWith('cart:')) {
      return null;
    }

    const parts = external.split(':');
    return parts.length >= 3 ? parts.slice(2).join(':') : null;
  })();
  const resolvedCartToken = input.cartToken?.trim() || externalIdCartToken;
  const emailExternalId = normalizedEmail
    ? `email:${createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 24)}`
    : null;
  const customerExternalId = normalizedCustomerId ? `shopify_customer:${normalizedCustomerId}` : null;

  const { isD1CustomersEnabled, d1GetLinkedCustomerExternalIds } = await import(
    '@/lib/server/integrations/d1-customers'
  );

  const linkedExternalRows: Array<{ external_id: string | null }> = isD1CustomersEnabled()
    ? await d1GetLinkedCustomerExternalIds(input.shopDomain, {
        customerId: normalizedCustomerId,
        email: normalizedEmail,
      })
    : await (() => {
        if (normalizedCustomerId && normalizedEmail) {
          return sql`
            SELECT external_id
            FROM shopify_customers
            WHERE shop_domain = ${input.shopDomain}
              AND external_id IS NOT NULL
              AND (customer_id = ${normalizedCustomerId} OR LOWER(email) = ${normalizedEmail})
            ORDER BY updated_at DESC
            LIMIT 25
          `;
        }
        if (normalizedCustomerId) {
          return sql`
            SELECT external_id
            FROM shopify_customers
            WHERE shop_domain = ${input.shopDomain}
              AND external_id IS NOT NULL
              AND customer_id = ${normalizedCustomerId}
            ORDER BY updated_at DESC
            LIMIT 25
          `;
        }
        if (normalizedEmail) {
          return sql`
            SELECT external_id
            FROM shopify_customers
            WHERE shop_domain = ${input.shopDomain}
              AND external_id IS NOT NULL
              AND LOWER(email) = ${normalizedEmail}
            ORDER BY updated_at DESC
            LIMIT 25
          `;
        }
        return Promise.resolve([] as Array<{ external_id: string | null }>);
      })();

  const historicalOrderExternalRows = await (async () => {
    if (!normalizedCustomerId && !normalizedEmail) {
      return [] as Array<{ external_id: string | null }>;
    }

    const { isD1CommerceEnabled, d1GetHistoricalOrderExternalIds } = await import(
      '@/lib/server/integrations/d1-commerce'
    );
    if (isD1CommerceEnabled()) {
      return d1GetHistoricalOrderExternalIds({
        shopDomain: input.shopDomain,
        customerId: normalizedCustomerId,
        email: normalizedEmail,
      });
    }

    if (normalizedCustomerId && normalizedEmail) {
      return sql`
        SELECT external_id
        FROM shopify_orders
        WHERE shop_domain = ${input.shopDomain}
          AND external_id IS NOT NULL
          AND external_id <> ''
          AND (customer_id = ${normalizedCustomerId} OR LOWER(email) = ${normalizedEmail})
        ORDER BY created_at DESC
        LIMIT 25
      `;
    }
    if (normalizedCustomerId) {
      return sql`
        SELECT external_id
        FROM shopify_orders
        WHERE shop_domain = ${input.shopDomain}
          AND external_id IS NOT NULL
          AND external_id <> ''
          AND customer_id = ${normalizedCustomerId}
        ORDER BY created_at DESC
        LIMIT 25
      `;
    }
    if (normalizedEmail) {
      return sql`
        SELECT external_id
        FROM shopify_orders
        WHERE shop_domain = ${input.shopDomain}
          AND external_id IS NOT NULL
          AND external_id <> ''
          AND LOWER(email) = ${normalizedEmail}
        ORDER BY created_at DESC
        LIMIT 25
      `;
    }
    return [] as Array<{ external_id: string | null }>;
  })();

  const cartExternalRows = resolvedCartToken
    ? await sql`
      WITH cart_related AS (
        SELECT
          external_id,
          created_at,
          COALESCE(metadata ->> 'clientId', '') AS client_id
        FROM subscriber_activity_events
        WHERE shop_domain = ${input.shopDomain}
          AND cart_token = ${resolvedCartToken}
          AND created_at >= ${new Date(occurredAt.getTime() - 14 * 24 * 60 * 60 * 1000)}

        UNION ALL

        SELECT
          external_id,
          created_at,
          COALESCE(client_id, '') AS client_id
        FROM pixel_events
        WHERE shop_domain = ${input.shopDomain}
          AND cart_token = ${resolvedCartToken}
          AND created_at >= ${new Date(occurredAt.getTime() - 14 * 24 * 60 * 60 * 1000)}
      ),
      stitched AS (
        SELECT external_id, created_at
        FROM cart_related

        UNION ALL

        SELECT e.external_id, e.created_at
        FROM subscriber_activity_events e
        WHERE e.shop_domain = ${input.shopDomain}
          AND e.created_at >= ${new Date(occurredAt.getTime() - 14 * 24 * 60 * 60 * 1000)}
          AND COALESCE(e.metadata ->> 'clientId', '') = ANY(
            ARRAY(SELECT DISTINCT client_id FROM cart_related WHERE client_id <> '')
          )

        UNION ALL

        SELECT p.external_id, p.created_at
        FROM pixel_events p
        WHERE p.shop_domain = ${input.shopDomain}
          AND p.created_at >= ${new Date(occurredAt.getTime() - 14 * 24 * 60 * 60 * 1000)}
          AND COALESCE(p.client_id, '') = ANY(
            ARRAY(SELECT DISTINCT client_id FROM cart_related WHERE client_id <> '')
          )
      )
      SELECT external_id
      FROM stitched
      WHERE external_id IS NOT NULL
        AND external_id <> ''
      ORDER BY
        CASE
          WHEN external_id LIKE 'anon:%' THEN 0
          WHEN external_id LIKE 'shopify_customer:%' THEN 1
          WHEN external_id LIKE 'email:%' THEN 2
          WHEN external_id LIKE 'cart:%' THEN 3
          WHEN external_id LIKE 'px:%' THEN 4
          ELSE 5
        END,
        created_at DESC
      LIMIT 50
    `
    : [];

  const clientExternalRows = input.clientId
    ? await sql`
      SELECT external_id
      FROM (
        SELECT external_id, created_at
        FROM subscriber_activity_events
        WHERE shop_domain = ${input.shopDomain}
          AND COALESCE(metadata ->> 'clientId', '') = ${input.clientId}
          AND created_at >= ${new Date(occurredAt.getTime() - 14 * 24 * 60 * 60 * 1000)}

        UNION ALL

        SELECT external_id, created_at
        FROM pixel_events
        WHERE shop_domain = ${input.shopDomain}
          AND COALESCE(client_id, '') = ${input.clientId}
          AND created_at >= ${new Date(occurredAt.getTime() - 14 * 24 * 60 * 60 * 1000)}
      ) stitched
      WHERE external_id IS NOT NULL
        AND external_id <> ''
      ORDER BY created_at DESC
      LIMIT 50
    `
    : [];

  const fingerprintExternalRows = await (() => {
    const ip = input.ipAddress?.trim() || null;
    const ua = input.userAgent?.trim() || null;
    if (!ip || !ua) {
      return Promise.resolve([] as Array<{ external_id: string | null }>);
    }

    return sql`
      SELECT external_id
      FROM (
        SELECT external_id, created_at
        FROM pixel_events
        WHERE shop_domain = ${input.shopDomain}
          AND COALESCE(metadata ->> 'requestIp', '') = ${ip}
          AND COALESCE(metadata ->> 'requestUserAgent', '') = ${ua}
          AND created_at >= ${new Date(occurredAt.getTime() - 7 * 24 * 60 * 60 * 1000)}

        UNION ALL

        SELECT external_id, created_at
        FROM subscriber_activity_events
        WHERE shop_domain = ${input.shopDomain}
          AND COALESCE(metadata ->> 'requestIp', '') = ${ip}
          AND COALESCE(metadata ->> 'requestUserAgent', '') = ${ua}
          AND created_at >= ${new Date(occurredAt.getTime() - 7 * 24 * 60 * 60 * 1000)}
      ) stitched
      WHERE external_id IS NOT NULL
        AND external_id <> ''
        AND (
          external_id LIKE 'anon:%'
          OR external_id LIKE 'cart:%'
          OR external_id LIKE 'px:%'
        )
      ORDER BY
        CASE
          WHEN external_id LIKE 'anon:%' THEN 0
          WHEN external_id LIKE 'cart:%' THEN 1
          WHEN external_id LIKE 'px:%' THEN 2
          ELSE 3
        END,
        created_at DESC
      LIMIT 50
    `;
  })();

  const externalIdCandidates = Array.from(
    new Set(
      [
        input.externalId?.trim() ?? null,
        customerExternalId,
        emailExternalId,
        ...linkedExternalRows.map((row) => (row.external_id ? String(row.external_id) : null)),
        ...historicalOrderExternalRows.map((row) => (row.external_id ? String(row.external_id) : null)),
        ...cartExternalRows.map((row) => (row.external_id ? String(row.external_id) : null)),
        ...clientExternalRows.map((row) => (row.external_id ? String(row.external_id) : null)),
        ...fingerprintExternalRows.map((row) => (row.external_id ? String(row.external_id) : null)),
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  const { hasOrderAttribution, findCampaignTouches, findAutomationTouches, updateTouchConversion, findAutomationFingerprintClicks, findAutomationFingerprintDeliveries, findCampaignFingerprintClicks, findCampaignFingerprintDeliveries, findCampaignTouchesByCampaignId } =
    await import('@/lib/server/integrations/deliveries-data');

  const priorAttribution = await hasOrderAttribution(input.shopDomain, input.orderId);
  if (priorAttribution?.type === 'campaign') {
    return { attributed: true, campaignId: priorAttribution.campaignId, model: settings.attributionModel };
  }
  if (priorAttribution?.type === 'automation') {
    return { attributed: true, campaignId: null, model: settings.attributionModel };
  }

  type CampaignTouch = {
    id: number;
    campaignId: string;
    touchedAt: Date;
    table: 'campaign_clicks' | 'campaign_deliveries';
  };
  type AutomationTouch = {
    id: number;
    ruleKey: string;
    touchedAt: Date;
    table: 'automation_clicks' | 'automation_deliveries';
  };

  const automationRuleKeyFromCampaign = (() => {
    const value = String(input.campaignId ?? '').trim();
    if (!value) {
      return null;
    }

    const allowedRuleKeys = new Set<AutomationRuleKey>([
      'welcome_subscriber',
      'browse_abandonment_15m',
      'cart_abandonment_30m',
      'checkout_abandonment_30m',
      'shipping_notifications',
      'back_in_stock',
      'price_drop',
      'win_back_7d',
      'post_purchase_followup',
    ]);

    return allowedRuleKeys.has(value as AutomationRuleKey) ? (value as AutomationRuleKey) : null;
  })();

  const fetchAutomationFingerprintFallback = async (ruleKey?: AutomationRuleKey | null) => {
    const ipAddress = input.ipAddress?.trim() || null;
    const userAgent = input.userAgent?.trim() || null;

    if (!ipAddress && !userAgent) {
      return [] as AutomationTouch[];
    }

    const rows = await findAutomationFingerprintClicks({
      shopDomain: input.shopDomain,
      windowStart,
      ruleKey,
      ipAddress,
      userAgent,
    });

    return rows.map((row) => ({
      id: Number(row.id),
      ruleKey: String(row.rule_key),
      touchedAt: new Date(String(row.clicked_at)),
      table: 'automation_clicks' as const,
    }));
  };

  const fetchAutomationDeliveryFingerprintFallback = async (ruleKey?: AutomationRuleKey | null) => {
    const userAgent = input.userAgent?.trim() || null;
    if (!userAgent) {
      return [] as AutomationTouch[];
    }

    const rows = await findAutomationFingerprintDeliveries({
      shopDomain: input.shopDomain,
      windowStart,
      ruleKey,
      userAgent,
    });

    return rows.map((row) => ({
      id: Number(row.id),
      ruleKey: String(row.rule_key),
      touchedAt: new Date(String(row.delivered_at)),
      table: 'automation_deliveries' as const,
    }));
  };

  const fetchCampaignClickFingerprintFallback = async (campaignId?: string | null) => {
    const ipAddress = input.ipAddress?.trim() || null;
    const userAgent = input.userAgent?.trim() || null;

    if (!ipAddress && !userAgent) {
      return [] as CampaignTouch[];
    }

    const rows = await findCampaignFingerprintClicks({
      shopDomain: input.shopDomain,
      windowStart,
      campaignId,
      ipAddress,
      userAgent,
    });

    return rows.map((row) => ({
      id: Number(row.id),
      campaignId: String(row.campaign_id),
      touchedAt: new Date(String(row.clicked_at)),
      table: 'campaign_clicks' as const,
    }));
  };

  const fetchCampaignDeliveryFingerprintFallback = async (campaignId?: string | null) => {
    const userAgent = input.userAgent?.trim() || null;
    if (!userAgent) {
      return [] as CampaignTouch[];
    }

    const rows = await findCampaignFingerprintDeliveries({
      shopDomain: input.shopDomain,
      windowStart,
      campaignId,
      userAgent,
    });

    return rows.map((row) => ({
      id: Number(row.id),
      campaignId: String(row.campaign_id),
      touchedAt: new Date(String(row.delivered_at)),
      table: 'campaign_deliveries' as const,
    }));
  };

  const fetchCampaignTouchesByCampaignId = async (
    campaignId: string,
    mode: 'click' | 'impression',
  ) => {
    const rows = await findCampaignTouchesByCampaignId({
      shopDomain: input.shopDomain,
      campaignId,
      windowStart,
      mode,
    });

    if (mode === 'click') {
      return rows.map((row) => ({
        id: Number(row.id),
        campaignId: String(row.campaign_id),
        touchedAt: new Date(String(row.clicked_at)),
        table: 'campaign_clicks' as const,
      }));
    }

    return rows.map((row) => ({
      id: Number(row.id),
      campaignId: String(row.campaign_id),
      touchedAt: new Date(String(row.delivered_at)),
      table: 'campaign_deliveries' as const,
    }));
  };

  const windowDays = settings.attributionModel === 'click'
    ? Math.max(1, settings.clickWindowDays)
    : Math.max(1, settings.impressionWindowDays);
  const windowStart = new Date(occurredAt.getTime() - windowDays * 24 * 60 * 60 * 1000);

  let campaignTouches: CampaignTouch[] = [];
  let automationTouches: AutomationTouch[] = [];

  if (settings.attributionModel === 'click') {
    if (externalIdCandidates.length > 0) {
      const { clicks } = await findCampaignTouches({
        shopDomain: input.shopDomain,
        externalIds: externalIdCandidates,
        windowStart,
      });
      campaignTouches = clicks.map((row) => ({
        id: Number(row.id),
        campaignId: String(row.campaign_id),
        touchedAt: new Date(String(row.clicked_at)),
        table: 'campaign_clicks' as const,
      }));
    }

    if (campaignTouches.length === 0 && input.campaignId && !automationRuleKeyFromCampaign) {
      campaignTouches = await fetchCampaignTouchesByCampaignId(String(input.campaignId), 'click');
    }

    if (campaignTouches.length === 0) {
      campaignTouches = await fetchCampaignClickFingerprintFallback(
        input.campaignId && !automationRuleKeyFromCampaign ? String(input.campaignId) : null,
      );
    }

    if (externalIdCandidates.length > 0) {
      const { clicks } = await findAutomationTouches({
        shopDomain: input.shopDomain,
        externalIds: externalIdCandidates,
        windowStart,
      });
      automationTouches = clicks.map((row) => ({
        id: Number(row.id),
        ruleKey: String(row.rule_key),
        touchedAt: new Date(String(row.clicked_at)),
        table: 'automation_clicks' as const,
      }));
    }

    if (automationTouches.length === 0) {
      if (automationRuleKeyFromCampaign) {
        automationTouches = await fetchAutomationFingerprintFallback(automationRuleKeyFromCampaign);
      }
      if (automationTouches.length === 0) {
        automationTouches = await fetchAutomationFingerprintFallback();
      }
    }
  } else {
    const campaignClickTouches = externalIdCandidates.length > 0
      ? (await findCampaignTouches({
        shopDomain: input.shopDomain,
        externalIds: externalIdCandidates,
        windowStart,
      })).clicks.map((row) => ({
        id: Number(row.id),
        campaignId: String(row.campaign_id),
        touchedAt: new Date(String(row.clicked_at)),
        table: 'campaign_clicks' as const,
      }))
      : [];

    const campaignImpressionTouches = externalIdCandidates.length > 0
      ? (await findCampaignTouches({
        shopDomain: input.shopDomain,
        externalIds: externalIdCandidates,
        windowStart,
      })).deliveries.map((row) => ({
        id: Number(row.id),
        campaignId: String(row.campaign_id),
        touchedAt: new Date(String(row.delivered_at)),
        table: 'campaign_deliveries' as const,
      }))
      : [];

    campaignTouches = [...campaignClickTouches, ...campaignImpressionTouches]
      .sort((a, b) => b.touchedAt.getTime() - a.touchedAt.getTime());

    if (campaignTouches.length === 0 && input.campaignId && !automationRuleKeyFromCampaign) {
      campaignTouches = await fetchCampaignTouchesByCampaignId(String(input.campaignId), 'impression');
    }

    if (campaignTouches.length === 0) {
      campaignTouches = await fetchCampaignDeliveryFingerprintFallback(
        input.campaignId && !automationRuleKeyFromCampaign ? String(input.campaignId) : null,
      );
    }

    const automationTouchResult = externalIdCandidates.length > 0
      ? await findAutomationTouches({
        shopDomain: input.shopDomain,
        externalIds: externalIdCandidates,
        windowStart,
      })
      : { clicks: [], deliveries: [] };

    const automationClickTouches = automationTouchResult.clicks.map((row) => ({
      id: Number(row.id),
      ruleKey: String(row.rule_key),
      touchedAt: new Date(String(row.clicked_at)),
      table: 'automation_clicks' as const,
    }));

    const automationImpressionTouches = automationTouchResult.deliveries.map((row) => ({
      id: Number(row.id),
      ruleKey: String(row.rule_key),
      touchedAt: new Date(String(row.delivered_at)),
      table: 'automation_deliveries' as const,
    }));

    automationTouches = [...automationClickTouches, ...automationImpressionTouches]
      .sort((a, b) => b.touchedAt.getTime() - a.touchedAt.getTime());

    if (automationTouches.length === 0) {
      if (automationRuleKeyFromCampaign) {
        automationTouches = await fetchAutomationDeliveryFingerprintFallback(automationRuleKeyFromCampaign);
      }
      if (automationTouches.length === 0) {
        automationTouches = await fetchAutomationDeliveryFingerprintFallback();
      }
    }

    if (automationTouches.length === 0) {
      if (automationRuleKeyFromCampaign) {
        automationTouches = await fetchAutomationFingerprintFallback(automationRuleKeyFromCampaign);
      }
      if (automationTouches.length === 0) {
        automationTouches = await fetchAutomationFingerprintFallback();
      }
    }
  }

  const campaignById = new Map<string, CampaignTouch>();
  for (const touch of campaignTouches) {
    if (!campaignById.has(touch.campaignId)) {
      campaignById.set(touch.campaignId, touch);
    }
  }

  const automationByRule = new Map<string, AutomationTouch>();
  for (const touch of automationTouches) {
    if (!automationByRule.has(touch.ruleKey)) {
      automationByRule.set(touch.ruleKey, touch);
    }
  }

  let selectedCampaignTouches = Array.from(campaignById.values());
  let selectedAutomationTouches = Array.from(automationByRule.values());

  if (settings.attributionCreditMode === 'last_touch') {
    const lastCampaignTouch = selectedCampaignTouches[0] ?? null;
    const lastAutomationTouch = selectedAutomationTouches[0] ?? null;

    if (lastCampaignTouch && lastAutomationTouch) {
      if (lastCampaignTouch.touchedAt >= lastAutomationTouch.touchedAt) {
        selectedAutomationTouches = [];
        selectedCampaignTouches = [lastCampaignTouch];
      } else {
        selectedCampaignTouches = [];
        selectedAutomationTouches = [lastAutomationTouch];
      }
    } else if (lastCampaignTouch) {
      selectedCampaignTouches = [lastCampaignTouch];
      selectedAutomationTouches = [];
    } else if (lastAutomationTouch) {
      selectedCampaignTouches = [];
      selectedAutomationTouches = [lastAutomationTouch];
    }
  }

  if (selectedCampaignTouches.length === 0 && selectedAutomationTouches.length === 0) {
    return { attributed: false };
  }

  for (const touch of selectedCampaignTouches) {
    await updateTouchConversion({
      table: touch.table,
      id: touch.id,
      orderId: input.orderId,
      convertedAtIso: occurredAt.toISOString(),
      revenueCents: input.revenueCents,
    });

    await sql`
      UPDATE campaigns
      SET revenue_cents = revenue_cents + ${input.revenueCents}
      WHERE id = ${touch.campaignId}
        AND shop_domain = ${input.shopDomain}
    `;
  }

  for (const touch of selectedAutomationTouches) {
    await updateTouchConversion({
      table: touch.table,
      id: touch.id,
      orderId: input.orderId,
      convertedAtIso: occurredAt.toISOString(),
      revenueCents: input.revenueCents,
    });
  }

  return {
    attributed: true,
    campaignId: selectedCampaignTouches[0]?.campaignId ?? null,
    model: settings.attributionModel,
  };
};

export const backfillDeliveriesToD1 = async (options?: {
  batchSize?: number;
  maxBatches?: number;
  afterCampaignDeliveryId?: number;
  afterCampaignClickId?: number;
  afterAutomationDeliveryId?: number;
  afterAutomationClickId?: number;
}) => {
  await ensureSchema();
  const sql = getNeonSql();

  const { isD1DeliveriesEnabled, d1InsertCampaignDelivery, d1InsertCampaignClick, d1InsertAutomationDelivery, d1InsertAutomationClick } =
    await import('@/lib/server/integrations/d1-deliveries');
  if (!isD1DeliveriesEnabled()) {
    throw new Error('D1_DELIVERIES_ENABLED is off — enable it before backfilling.');
  }

  const batchSize = Math.min(Math.max(options?.batchSize ?? 50, 1), 200);
  const maxBatches = Math.min(Math.max(options?.maxBatches ?? 40, 1), 1000);

  let campaignDeliveryCursor = Number(options?.afterCampaignDeliveryId ?? 0);
  let campaignClickCursor = Number(options?.afterCampaignClickId ?? 0);
  let automationDeliveryCursor = Number(options?.afterAutomationDeliveryId ?? 0);
  let automationClickCursor = Number(options?.afterAutomationClickId ?? 0);

  let campaignDeliveriesCopied = 0;
  let campaignClicksCopied = 0;
  let automationDeliveriesCopied = 0;
  let automationClicksCopied = 0;

  let campaignDeliveriesDone = false;
  let campaignClicksDone = false;
  let automationDeliveriesDone = false;
  let automationClicksDone = false;

  const parseStepKey = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return { stepKey: null as string | null, cartToken: null as string | null };
    }
    const record = payload as Record<string, unknown>;
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    return {
      stepKey: metadata.stepKey == null ? null : String(metadata.stepKey),
      cartToken: record.cartToken == null ? null : String(record.cartToken),
    };
  };

  for (let batch = 0; batch < maxBatches; batch += 1) {
    if (campaignDeliveriesDone && campaignClicksDone && automationDeliveriesDone && automationClicksDone) {
      break;
    }

    if (!campaignDeliveriesDone) {
      const rows = await sql`
        SELECT id, campaign_id, shop_domain, subscriber_id, token_id, fcm_message_id,
               delivered_at, clicked_at, converted_at, order_id, revenue_cents,
               external_id, user_agent, ip_address
        FROM campaign_deliveries
        WHERE id > ${campaignDeliveryCursor}
        ORDER BY id ASC
        LIMIT ${batchSize}
      `;
      if (rows.length === 0) {
        campaignDeliveriesDone = true;
      } else {
        for (const row of rows as Array<Record<string, unknown>>) {
          await d1InsertCampaignDelivery({
            id: Number(row.id),
            campaignId: String(row.campaign_id),
            shopDomain: String(row.shop_domain),
            subscriberId: Number(row.subscriber_id),
            tokenId: Number(row.token_id),
            externalId: row.external_id == null ? null : String(row.external_id),
            userAgent: row.user_agent == null ? null : String(row.user_agent),
            fcmMessageId: row.fcm_message_id == null ? null : String(row.fcm_message_id),
            deliveredAt: row.delivered_at == null ? null : String(row.delivered_at),
          });
        }
        campaignDeliveriesCopied += rows.length;
        campaignDeliveryCursor = Number(rows[rows.length - 1]?.id ?? campaignDeliveryCursor);
        if (rows.length < batchSize) {
          campaignDeliveriesDone = true;
        }
      }
    }

    if (!campaignClicksDone) {
      const rows = await sql`
        SELECT id, campaign_id, shop_domain, subscriber_id, target_url, clicked_at,
               user_agent, ip_address, referrer, order_id, converted_at, revenue_cents, external_id
        FROM campaign_clicks
        WHERE id > ${campaignClickCursor}
        ORDER BY id ASC
        LIMIT ${batchSize}
      `;
      if (rows.length === 0) {
        campaignClicksDone = true;
      } else {
        for (const row of rows as Array<Record<string, unknown>>) {
          await d1InsertCampaignClick({
            id: Number(row.id),
            campaignId: String(row.campaign_id),
            shopDomain: String(row.shop_domain),
            subscriberId: row.subscriber_id == null ? null : Number(row.subscriber_id),
            externalId: row.external_id == null ? null : String(row.external_id),
            targetUrl: String(row.target_url),
            userAgent: row.user_agent == null ? null : String(row.user_agent),
            ipAddress: row.ip_address == null ? null : String(row.ip_address),
            referrer: row.referrer == null ? null : String(row.referrer),
            clickedAt: row.clicked_at == null ? null : String(row.clicked_at),
          });
        }
        campaignClicksCopied += rows.length;
        campaignClickCursor = Number(rows[rows.length - 1]?.id ?? campaignClickCursor);
        if (rows.length < batchSize) {
          campaignClicksDone = true;
        }
      }
    }

    if (!automationDeliveriesDone) {
      const rows = await sql`
        SELECT d.id, d.automation_job_id, d.rule_key, d.shop_domain, d.subscriber_id, d.token_id,
               d.external_id, d.target_url, d.fcm_message_id, d.delivered_at, d.clicked_at,
               d.user_agent, d.ip_address, d.converted_at, d.order_id, d.revenue_cents,
               j.payload
        FROM automation_deliveries d
        LEFT JOIN automation_jobs j ON j.id = d.automation_job_id
        WHERE d.id > ${automationDeliveryCursor}
        ORDER BY d.id ASC
        LIMIT ${batchSize}
      `;
      if (rows.length === 0) {
        automationDeliveriesDone = true;
      } else {
        for (const row of rows as Array<Record<string, unknown>>) {
          const meta = parseStepKey(row.payload);
          await d1InsertAutomationDelivery({
            id: Number(row.id),
            automationJobId: row.automation_job_id == null ? null : String(row.automation_job_id),
            ruleKey: String(row.rule_key),
            shopDomain: String(row.shop_domain),
            subscriberId: row.subscriber_id == null ? null : Number(row.subscriber_id),
            tokenId: row.token_id == null ? null : Number(row.token_id),
            externalId: row.external_id == null ? null : String(row.external_id),
            targetUrl: row.target_url == null ? null : String(row.target_url),
            fcmMessageId: row.fcm_message_id == null ? null : String(row.fcm_message_id),
            userAgent: row.user_agent == null ? null : String(row.user_agent),
            ipAddress: row.ip_address == null ? null : String(row.ip_address),
            deliveredAt: row.delivered_at == null ? null : String(row.delivered_at),
            stepKey: meta.stepKey,
            cartToken: meta.cartToken,
          });
        }
        automationDeliveriesCopied += rows.length;
        automationDeliveryCursor = Number(rows[rows.length - 1]?.id ?? automationDeliveryCursor);
        if (rows.length < batchSize) {
          automationDeliveriesDone = true;
        }
      }
    }

    if (!automationClicksDone) {
      const rows = await sql`
        SELECT id, rule_key, shop_domain, subscriber_id, external_id, target_url, clicked_at,
               user_agent, ip_address, referrer, order_id, converted_at, revenue_cents
        FROM automation_clicks
        WHERE id > ${automationClickCursor}
        ORDER BY id ASC
        LIMIT ${batchSize}
      `;
      if (rows.length === 0) {
        automationClicksDone = true;
      } else {
        for (const row of rows as Array<Record<string, unknown>>) {
          await d1InsertAutomationClick({
            id: Number(row.id),
            ruleKey: String(row.rule_key),
            shopDomain: String(row.shop_domain),
            subscriberId: row.subscriber_id == null ? null : Number(row.subscriber_id),
            externalId: row.external_id == null ? null : String(row.external_id),
            targetUrl: String(row.target_url),
            userAgent: row.user_agent == null ? null : String(row.user_agent),
            ipAddress: row.ip_address == null ? null : String(row.ip_address),
            referrer: row.referrer == null ? null : String(row.referrer),
            clickedAt: row.clicked_at == null ? null : String(row.clicked_at),
          });
        }
        automationClicksCopied += rows.length;
        automationClickCursor = Number(rows[rows.length - 1]?.id ?? automationClickCursor);
        if (rows.length < batchSize) {
          automationClicksDone = true;
        }
      }
    }
  }

  return {
    campaignDeliveriesCopied,
    campaignClicksCopied,
    automationDeliveriesCopied,
    automationClicksCopied,
    nextCampaignDeliveryCursor: campaignDeliveryCursor,
    nextCampaignClickCursor: campaignClickCursor,
    nextAutomationDeliveryCursor: automationDeliveryCursor,
    nextAutomationClickCursor: automationClickCursor,
    campaignDeliveriesDone,
    campaignClicksDone,
    automationDeliveriesDone,
    automationClicksDone,
    done:
      campaignDeliveriesDone &&
      campaignClicksDone &&
      automationDeliveriesDone &&
      automationClicksDone,
  };
};

export const verifyDeliveriesD1Parity = async (shopDomain?: string) => {
  await ensureSchema();
  const sql = getNeonSql();
  const {
    d1CountCampaignDeliveries,
    d1CountCampaignClicks,
    d1CountAutomationDeliveries,
    d1CountAutomationClicks,
  } = await import('@/lib/server/integrations/d1-deliveries');

  const { neonTableExists } = await import('@/lib/server/integrations/neon-legacy-tables');

  const countFromNeon = async (table: string): Promise<number> => {
    if (!(await neonTableExists(table))) {
      return 0;
    }
    switch (table) {
      case 'campaign_deliveries':
        return shopDomain
          ? Number(
              (
                await sql`SELECT COUNT(*)::BIGINT AS count FROM campaign_deliveries WHERE shop_domain = ${shopDomain}`
              )[0]?.count ?? 0,
            )
          : Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM campaign_deliveries`)[0]?.count ?? 0);
      case 'campaign_clicks':
        return shopDomain
          ? Number(
              (
                await sql`SELECT COUNT(*)::BIGINT AS count FROM campaign_clicks WHERE shop_domain = ${shopDomain}`
              )[0]?.count ?? 0,
            )
          : Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM campaign_clicks`)[0]?.count ?? 0);
      case 'automation_deliveries':
        return shopDomain
          ? Number(
              (
                await sql`SELECT COUNT(*)::BIGINT AS count FROM automation_deliveries WHERE shop_domain = ${shopDomain}`
              )[0]?.count ?? 0,
            )
          : Number(
              (await sql`SELECT COUNT(*)::BIGINT AS count FROM automation_deliveries`)[0]?.count ?? 0,
            );
      case 'automation_clicks':
        return shopDomain
          ? Number(
              (
                await sql`SELECT COUNT(*)::BIGINT AS count FROM automation_clicks WHERE shop_domain = ${shopDomain}`
              )[0]?.count ?? 0,
            )
          : Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM automation_clicks`)[0]?.count ?? 0);
      default:
        return 0;
    }
  };

  const [neonCampaignDeliveries, neonCampaignClicks, neonAutomationDeliveries, neonAutomationClicks] =
    await Promise.all([
      countFromNeon('campaign_deliveries'),
      countFromNeon('campaign_clicks'),
      countFromNeon('automation_deliveries'),
      countFromNeon('automation_clicks'),
    ]);

  const [d1CampaignDeliveries, d1CampaignClicks, d1AutomationDeliveries, d1AutomationClicks] =
    await Promise.all([
      d1CountCampaignDeliveries(shopDomain),
      d1CountCampaignClicks(shopDomain),
      d1CountAutomationDeliveries(shopDomain),
      d1CountAutomationClicks(shopDomain),
    ]);

  return {
    shopDomain: shopDomain ?? null,
    neonCampaignDeliveries,
    d1CampaignDeliveries,
    campaignDeliveriesMatch: neonCampaignDeliveries === d1CampaignDeliveries,
    neonCampaignClicks,
    d1CampaignClicks,
    campaignClicksMatch: neonCampaignClicks === d1CampaignClicks,
    neonAutomationDeliveries,
    d1AutomationDeliveries,
    automationDeliveriesMatch: neonAutomationDeliveries === d1AutomationDeliveries,
    neonAutomationClicks,
    d1AutomationClicks,
    automationClicksMatch: neonAutomationClicks === d1AutomationClicks,
    inSync:
      neonCampaignDeliveries === d1CampaignDeliveries &&
      neonCampaignClicks === d1CampaignClicks &&
      neonAutomationDeliveries === d1AutomationDeliveries &&
      neonAutomationClicks === d1AutomationClicks,
  };
};

export const purgeNeonDeliveriesAfterD1Cutover = async () => {
  await ensureSchema();
  const sql = getNeonSql();
  const { isD1DeliveriesEnabled } = await import('@/lib/server/integrations/d1-deliveries');
  if (!isD1DeliveriesEnabled()) {
    throw new Error('D1_DELIVERIES_ENABLED must be on before purging Neon delivery copies.');
  }

  const parity = await verifyDeliveriesD1Parity();
  if (!parity.inSync) {
    throw new Error(
      `Parity check failed before Neon purge: campaign_deliveries=${parity.campaignDeliveriesMatch}, campaign_clicks=${parity.campaignClicksMatch}, automation_deliveries=${parity.automationDeliveriesMatch}, automation_clicks=${parity.automationClicksMatch}`,
    );
  }

  const { neonTableExists } = await import('@/lib/server/integrations/neon-legacy-tables');
  const campaignDeliveries = (await neonTableExists('campaign_deliveries'))
    ? await sql`DELETE FROM campaign_deliveries RETURNING id`
    : [];
  const campaignClicks = (await neonTableExists('campaign_clicks'))
    ? await sql`DELETE FROM campaign_clicks RETURNING id`
    : [];
  const automationDeliveries = (await neonTableExists('automation_deliveries'))
    ? await sql`DELETE FROM automation_deliveries RETURNING id`
    : [];
  const automationClicks = (await neonTableExists('automation_clicks'))
    ? await sql`DELETE FROM automation_clicks RETURNING id`
    : [];

  return {
    campaignDeliveriesDeleted: campaignDeliveries.length,
    campaignClicksDeleted: campaignClicks.length,
    automationDeliveriesDeleted: automationDeliveries.length,
    automationClicksDeleted: automationClicks.length,
  };
};

export const registerWebhookEvent = async (input: RegisterWebhookEventInput) => {
  // Webhook idempotency is a short-lived dedup check, not durable business data.
  // When Cloudflare KV is available we keep it entirely off Neon: Shopify sends
  // thousands of webhooks/day (carts/update alone), and each Neon INSERT +
  // ensureMerchant was keeping the database awake around the clock. A KV key with
  // a 48h TTL covers Shopify's retry window at effectively zero DB cost.
  const shopDomain = input.shopDomain.trim().toLowerCase();

  const {
    isCloudflareKvEnabled,
    readKvJson,
    writeKvJson,
  } = await import('@/lib/server/cache/cloudflare-kv');

  if (isCloudflareKvEnabled()) {
    const key = `pe:wh:${shopDomain}:${input.topic}:${input.eventId}`;
    try {
      const existing = await readKvJson<{ at?: number }>(key);
      if (existing) {
        return false; // duplicate within the retry window
      }
      // 48h TTL comfortably covers Shopify's webhook retry schedule.
      void writeKvJson(key, { at: Date.now() }, 48 * 60 * 60).catch(() => undefined);
      return true;
    } catch {
      // KV hiccup — fall through to the durable Neon dedup below when available.
    }
  }

  const { neonTableExists } = await import('@/lib/server/integrations/neon-legacy-tables');
  if (!(await neonTableExists('webhook_events'))) {
    return true;
  }

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
