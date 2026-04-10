import { neon } from '@neondatabase/serverless';

import { env } from '@/lib/config/env';

export const getNeonSql = () => {
  if (!env.NEON_DATABASE_URL) {
    throw new Error('Missing NEON_DATABASE_URL. Add it to .env.local.');
  }

  return neon(env.NEON_DATABASE_URL);
};
