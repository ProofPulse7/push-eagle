import { neon } from '@neondatabase/serverless';

import { env } from '@/lib/config/env';
import { isValidPostgresConnectionString, sanitizePostgresConnectionString } from '@/lib/config/sanitize-connection-string';

export const getNeonSql = () => {
  const raw = env.NEON_DATABASE_URL || env.DATABASE_URL;
  const connectionString = sanitizePostgresConnectionString(raw);

  if (!connectionString) {
    throw new Error('Missing NEON_DATABASE_URL or DATABASE_URL. Add one to your environment.');
  }

  if (!isValidPostgresConnectionString(connectionString)) {
    throw new Error(
      'NEON_DATABASE_URL is not a valid Postgres URL. Remove wrapping quotes in Vercel env vars.',
    );
  }

  return neon(connectionString);
};
