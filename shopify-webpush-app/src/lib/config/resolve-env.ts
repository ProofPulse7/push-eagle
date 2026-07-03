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
  CLOUDFLARE_D1_DATABASE_ID: z.string().default(''),
  CLOUDFLARE_WORKER_URL: z.string().default(''),
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
  // Staged migration of the audience (subscribers + subscriber_tokens) to D1.
  //   off        -> Neon only (current behavior)
  //   dual_write -> writes mirror to D1 (best-effort), reads stay on Neon
  //   read       -> reads + writes use D1 as source of truth (Stage 2 cutover)
  // Anything unrecognized is treated as 'off' for safety.
  D1_AUDIENCE_MODE: z
    .string()
    .default('off')
    .transform((value) => {
      const normalized = value.trim().toLowerCase();
      return normalized === 'dual_write' || normalized === 'read' ? normalized : 'off';
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
        && Boolean(parsed.CLOUDFLARE_D1_DATABASE_ID.trim())
      ),
    AUTOMATION_QUEUE_ENABLED:
      parsed.AUTOMATION_QUEUE_ENABLED || Boolean(parsed.CLOUDFLARE_WORKER_URL.trim()),
  };
};

export { isValidPostgresConnectionString, sanitizePostgresConnectionString };
