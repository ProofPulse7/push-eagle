import { z } from 'zod';

const EnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  CRON_SECRET: z.string().default(''),
  SHOPIFY_API_KEY: z.string().default(''),
  SHOPIFY_API_SECRET: z.string().default(''),
  SHOPIFY_SCOPES: z.string().default('read_products,read_customers,write_products'),
  SHOPIFY_APP_URL: z.string().url().default('http://localhost:3000'),
  SHOPIFY_ROOT_APP_URL: z.string().url().default('https://push-eagle.vercel.app'),
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
  // VAPID keys for cross-browser Web Push (Firefox, Safari 16.4+, and FCM fallback)
  // Generate with: node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k))"
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:support@push-eagle.com'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export const env: AppEnv = EnvSchema.parse(process.env);

export const isSupabase = env.DATABASE_PROVIDER === 'supabase';
export const isNeon = env.DATABASE_PROVIDER === 'neon';
