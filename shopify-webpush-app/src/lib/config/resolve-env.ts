import { z } from 'zod';

import {
  isValidPostgresConnectionString,
  sanitizePostgresConnectionString,
} from '@/lib/config/sanitize-connection-string';

const EnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  CRON_SECRET: z.string().default(''),
  SHOPIFY_API_KEY: z.string().default(''),
  SHOPIFY_API_SECRET: z.string().default(''),
  SHOPIFY_SCOPES: z
    .string()
    .default(
      'read_customer_events,read_customers,read_fulfillments,read_inventory,read_orders,read_products,read_themes,write_app_proxy,write_pixels',
    ),
  SHOPIFY_APP_URL: z.string().url().default('http://localhost:3000'),
  SHOPIFY_ROOT_APP_URL: z.string().url().default('https://push-eagle.vercel.app'),
  SHOPIFY_SESSION_DATABASE_URL: z.string().default(''),
  SHOPIFY_WEBHOOK_SECRET: z.string().default(''),
  SHOPIFY_DASHBOARD_SSO_SECRET: z.string().default(''),
  DATABASE_PROVIDER: z.enum(['neon', 'supabase']).default('neon'),
  DATABASE_URL: z.string().default(''),
  NEON_DATABASE_URL: z.string().default(''),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_ANON_KEY: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().default(''),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().default(''),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().default(''),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().default(''),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().default(''),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().default(''),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().default(''),
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: z.string().default(''),
  FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON: z.string().default(''),
  FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64: z.string().default(''),
  R2_ACCOUNT_ID: z.string().default(''),
  R2_BUCKET_NAME: z.string().default(''),
  R2_S3_ENDPOINT: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_PUBLIC_BASE_URL: z.string().default(''),
  CLOUDFLARE_ACCOUNT_ID: z.string().default(''),
  CLOUDFLARE_API_TOKEN: z.string().default(''),
  CLOUDFLARE_KV_NAMESPACE_ID: z.string().default(''),
  // Primary/default D1 database. Every D1 layer falls back to this id, so with
  // only this set behavior is exactly as before (one shared DB). Today this DB
  // holds raw events + the product-variant catalog.
  CLOUDFLARE_D1_DATABASE_ID: z.string().default(''),
  // Dedicated D1 database for the crown-jewel audience (subscribers +
  // subscriber_tokens). Isolating the audience means high-volume event churn on
  // another DB can never exhaust storage/limits and block a token write — a lost
  // token means a lost subscriber for the merchant, so this is the priority.
  // Falls back to CLOUDFLARE_D1_DATABASE_ID when unset.
  CLOUDFLARE_D1_AUDIENCE_DATABASE_ID: z.string().default(''),
  // Dedicated D1 database for the high-volume, ephemeral raw event data
  // (pixel_events + subscriber_activity_events). Optional second layer of
  // isolation. Falls back to CLOUDFLARE_D1_DATABASE_ID when unset.
  CLOUDFLARE_D1_EVENTS_DATABASE_ID: z.string().default(''),
  // Dedicated D1 for delivery/click detail (campaign + automation deliveries/clicks).
  // Falls back to CLOUDFLARE_D1_DATABASE_ID when unset.
  CLOUDFLARE_D1_DELIVERIES_DATABASE_ID: z.string().default(''),
  CLOUDFLARE_WORKER_URL: z.string().default(''),
  // Retention window (days) for raw events in D1. Must stay >= the longest
  // automation lookback (browse-abandonment/abandoned-cart use up to 14 days)
  // or attribution breaks. Lower it to shrink the events DB and stay free
  // longer. Clamped to a 2-day floor for safety.
  D1_EVENTS_RETENTION_DAYS: z
    .string()
    .default('14')
    .transform((value) => {
      const parsed = Number.parseInt(value.trim(), 10);
      return Number.isFinite(parsed) ? Math.max(2, parsed) : 14;
    }),
  AUTOMATION_QUEUE_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value.trim().toLowerCase() === 'true'),
  D1_EVENTS_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value.trim().toLowerCase() === 'true'),
  // Explicit opt-in (unlike D1_EVENTS_ENABLED, this never auto-enables from creds)
  // so the catalog->D1 code ships dormant and is only activated after validation.
  D1_CATALOG_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value.trim().toLowerCase() === 'true'),
  // Explicit opt-in for moving the Shopify customer cache to D1 (segmentation,
  // GDPR, attribution). Independent from D1_CATALOG_ENABLED for staged rollout.
  D1_CUSTOMERS_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value.trim().toLowerCase() === 'true'),
  // Explicit opt-in for moving the high-volume commerce tables (shopify_orders,
  // shopify_order_items, shopify_fulfillments) to D1. These are the biggest
  // scale threat on Neon (hundreds of orders/day/merchant). All order<->subscriber
  // usage is via the subscriber_id NUMBER only (never an in-DB JOIN to subscribers),
  // so orders move cleanly to D1 with a one-time backfill + self-healing webhooks.
  // Ships dormant; when off everything stays on Neon byte-for-byte.
  D1_COMMERCE_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value.trim().toLowerCase() === 'true'),
  // Explicit opt-in for moving delivery/click detail tables to D1. Lifetime stats
  // (campaigns row + automation_rule_stats) stay on Neon; detail rows move here.
  D1_DELIVERIES_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value.trim().toLowerCase() === 'true'),
  // Staged migration of the audience (subscribers + subscriber_tokens) to D1.
  //   off        -> Neon only (current behavior)
  //   dual_write -> writes mirror to D1 (best-effort), reads stay on Neon
  //   shadow     -> dual-write + reads run BOTH (Neon authoritative) and log any
  //                 mismatch, so the D1 read layer can be validated against live
  //                 traffic with zero production risk
  //   read       -> reads use D1 (Neon fallback on error); still dual-writes to
  //                 Neon so Neon stays a hot standby until a later d1-only step
  //   d1_only    -> D1 is the sole store: reads use D1 and writes go ONLY to D1
  //                 (D1 assigns ids). Neon audience tables are no longer written,
  //                 which is what actually frees the Neon storage. Only flip this
  //                 after 'read' has been validated in production.
  // Anything unrecognized is treated as 'off' for safety.
  D1_AUDIENCE_MODE: z
    .string()
    .default('off')
    .transform((value) => {
      const normalized = value.trim().toLowerCase();
      return normalized === 'dual_write' ||
        normalized === 'shadow' ||
        normalized === 'read' ||
        normalized === 'd1_only'
        ? normalized
        : 'off';
    }),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:support@push-eagle.com'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

const DASHBOARD_PRODUCTION_URL = 'https://push-eagle-dashboard.vercel.app';
const cleanPostgresUrl = (value: string) => sanitizePostgresConnectionString(value.trim());

const fixDashboardPublicUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) {
    return DASHBOARD_PRODUCTION_URL;
  }
  // Common misconfiguration: dashboard project pointing at the Remix app URL.
  if (
    trimmed === 'https://push-eagle.vercel.app' ||
    trimmed === 'http://push-eagle.vercel.app'
  ) {
    return DASHBOARD_PRODUCTION_URL;
  }
  return trimmed;
};

export const resolveShopifySessionDatabaseUrl = (raw: AppEnv) => {
  const explicit = cleanPostgresUrl(raw.SHOPIFY_SESSION_DATABASE_URL);
  if (explicit) {
    return explicit;
  }

  return cleanPostgresUrl(raw.NEON_DATABASE_URL) || cleanPostgresUrl(raw.DATABASE_URL) || '';
};

export const resolveAppEnv = (): AppEnv => {
  const parsed = EnvSchema.parse(process.env);
  const sessionDatabaseUrl = resolveShopifySessionDatabaseUrl(parsed);
  const dashboardUrl = fixDashboardPublicUrl(parsed.NEXT_PUBLIC_APP_URL);
  const ssoSecret =
    parsed.SHOPIFY_DASHBOARD_SSO_SECRET.trim() || parsed.SHOPIFY_API_SECRET.trim();

  const neonDatabaseUrl = cleanPostgresUrl(parsed.NEON_DATABASE_URL);
  const databaseUrl = cleanPostgresUrl(parsed.DATABASE_URL);

  return {
    ...parsed,
    NEXT_PUBLIC_APP_URL: dashboardUrl,
    NEON_DATABASE_URL: neonDatabaseUrl,
    DATABASE_URL: databaseUrl,
    SHOPIFY_SESSION_DATABASE_URL: sessionDatabaseUrl,
    SHOPIFY_DASHBOARD_SSO_SECRET: ssoSecret,
    SHOPIFY_WEBHOOK_SECRET:
      parsed.SHOPIFY_WEBHOOK_SECRET.trim() || parsed.SHOPIFY_API_SECRET.trim(),
    D1_EVENTS_ENABLED:
      parsed.D1_EVENTS_ENABLED
      || (
        Boolean(parsed.CLOUDFLARE_ACCOUNT_ID.trim())
        && Boolean(parsed.CLOUDFLARE_API_TOKEN.trim())
        && (
          Boolean(parsed.CLOUDFLARE_D1_EVENTS_DATABASE_ID.trim())
          || Boolean(parsed.CLOUDFLARE_D1_DATABASE_ID.trim())
        )
      ),
    AUTOMATION_QUEUE_ENABLED:
      parsed.AUTOMATION_QUEUE_ENABLED || Boolean(parsed.CLOUDFLARE_WORKER_URL.trim()),
  };
};

export { isValidPostgresConnectionString, sanitizePostgresConnectionString };
