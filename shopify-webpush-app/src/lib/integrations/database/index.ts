import { isNeon, isSupabase } from '@/lib/config/env';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { getSupabaseAdmin } from '@/lib/integrations/database/supabase';

export type DbProvider = 'neon' | 'supabase';

export const getDbProvider = (): DbProvider => {
  if (isNeon) {
    return 'neon';
  }
  if (isSupabase) {
    return 'supabase';
  }

  throw new Error('Invalid DATABASE_PROVIDER. Use "neon" or "supabase".');
};

export const getDatabaseClient = () => {
  const provider = getDbProvider();

  if (provider === 'neon') {
    return { provider, client: getNeonSql() };
  }

  return { provider, client: getSupabaseAdmin() };
};
