import { neon } from '@neondatabase/serverless';

import { isValidPostgresConnectionString, sanitizePostgresConnectionString } from '@/lib/config/sanitize-connection-string';
import { env } from '@/lib/config/env';

type SessionRow = { accessToken?: string; isOnline?: boolean };

const getSessionSql = () => {
  const url = sanitizePostgresConnectionString(env.SHOPIFY_SESSION_DATABASE_URL);
  if (!url || !isValidPostgresConnectionString(url)) {
    return null;
  }
  return neon(url);
};

const readToken = (rows: SessionRow[]) => {
  const token = rows[0]?.accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
};

/**
 * Read offline access token from Prisma Session tables (public + shopify_sessions schemas).
 */
export const readOfflineAccessTokenFromPrismaSessions = async (shopDomain: string) => {
  const sql = getSessionSql();
  if (!sql) {
    return null;
  }

  const shop = shopDomain.trim().toLowerCase();
  const offlineId = `offline_${shop}`;
  const attempts = [
    () => sql`
      SELECT "accessToken"
      FROM public."Session"
      WHERE id = ${offlineId}
      LIMIT 1
    `,
    () => sql`
      SELECT "accessToken"
      FROM public."Session"
      WHERE shop = ${shop}
        AND "isOnline" = false
      ORDER BY expires DESC NULLS LAST
      LIMIT 1
    `,
    () => sql`
      SELECT "accessToken"
      FROM shopify_sessions."Session"
      WHERE id = ${offlineId}
      LIMIT 1
    `,
    () => sql`
      SELECT "accessToken"
      FROM shopify_sessions."Session"
      WHERE shop = ${shop}
        AND "isOnline" = false
      ORDER BY expires DESC NULLS LAST
      LIMIT 1
    `,
  ];

  for (const attempt of attempts) {
    try {
      const token = readToken((await attempt()) as SessionRow[]);
      if (token) {
        return token;
      }
    } catch {
      // try next schema
    }
  }

  return null;
};
