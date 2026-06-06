import { resolveAppEnv } from '@/lib/config/resolve-env';

export type { AppEnv } from '@/lib/config/resolve-env';
export {
  isValidPostgresConnectionString,
  resolveShopifySessionDatabaseUrl,
  sanitizePostgresConnectionString,
} from '@/lib/config/resolve-env';

export const env = resolveAppEnv();

export const isSupabase = env.DATABASE_PROVIDER === 'supabase';
export const isNeon = env.DATABASE_PROVIDER === 'neon';
