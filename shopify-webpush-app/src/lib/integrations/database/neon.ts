import { neon } from '@neondatabase/serverless';

import { env } from '@/lib/config/env';
import { isValidPostgresConnectionString, sanitizePostgresConnectionString } from '@/lib/config/sanitize-connection-string';

let cachedSql: ReturnType<typeof neon> | null = null;
let cachedConnectionString: string | null = null;

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

  if (!cachedSql || cachedConnectionString !== connectionString) {
    cachedSql = neon(connectionString);
    cachedConnectionString = connectionString;
  }

  return cachedSql;
};
