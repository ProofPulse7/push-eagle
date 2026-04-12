import { neon } from '@neondatabase/serverless';

import { env } from '@/lib/config/env';

export const getNeonSql = () => {
  const connectionString = env.NEON_DATABASE_URL || env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('Missing NEON_DATABASE_URL or DATABASE_URL. Add one to your environment.');
  }

  return neon(connectionString);
};
