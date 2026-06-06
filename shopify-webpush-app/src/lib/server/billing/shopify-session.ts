import { neon } from '@neondatabase/serverless';

import { getNeonSql } from '@/lib/integrations/database/neon';
import { env } from '@/lib/config/env';

type SessionRow = { accessToken: string };

export const hasShopifySessionDatabase = () => Boolean(env.SHOPIFY_SESSION_DATABASE_URL.trim());

const getPrismaSessionSql = () => {
  const url = env.SHOPIFY_SESSION_DATABASE_URL.trim();
  if (!url) {
    return null;
  }
  return neon(url);
};

const readTokenFromRows = (rows: SessionRow[]) => {
  const token = rows[0]?.accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
};

const getMerchantStoredAccessToken = async (shop: string) => {
  try {
    const sql = getNeonSql();
    const rows = await sql`
      SELECT shopify_offline_access_token
      FROM merchants
      WHERE shop_domain = ${shop}
      LIMIT 1
    `;
    const token = rows[0]?.shopify_offline_access_token;
    return typeof token === 'string' && token.length > 0 ? token : null;
  } catch {
    return null;
  }
};

const queryOfflineFromPublic = async (shop: string) => {
  const sql = getPrismaSessionSql();
  if (!sql) {
    return null;
  }

  const rows = await sql`
    SELECT "accessToken"
    FROM "Session"
    WHERE shop = ${shop}
      AND "isOnline" = false
    ORDER BY expires DESC NULLS LAST
    LIMIT 1
  `;

  return readTokenFromRows(rows as SessionRow[]);
};

const queryAnyFromPublic = async (shop: string) => {
  const sql = getPrismaSessionSql();
  if (!sql) {
    return null;
  }

  const rows = await sql`
    SELECT "accessToken"
    FROM "Session"
    WHERE shop = ${shop}
    ORDER BY "isOnline" ASC, expires DESC NULLS LAST
    LIMIT 1
  `;

  return readTokenFromRows(rows as SessionRow[]);
};

const queryOfflineFromShopifySessionsSchema = async (shop: string) => {
  const sql = getPrismaSessionSql();
  if (!sql) {
    return null;
  }

  const rows = await sql`
    SELECT "accessToken"
    FROM shopify_sessions."Session"
    WHERE shop = ${shop}
      AND "isOnline" = false
    ORDER BY expires DESC NULLS LAST
    LIMIT 1
  `;

  return readTokenFromRows(rows as SessionRow[]);
};

const queryAnyFromShopifySessionsSchema = async (shop: string) => {
  const sql = getPrismaSessionSql();
  if (!sql) {
    return null;
  }

  const rows = await sql`
    SELECT "accessToken"
    FROM shopify_sessions."Session"
    WHERE shop = ${shop}
    ORDER BY "isOnline" ASC, expires DESC NULLS LAST
    LIMIT 1
  `;

  return readTokenFromRows(rows as SessionRow[]);
};

const queryByOfflineSessionId = async (shop: string) => {
  const sql = getPrismaSessionSql();
  if (!sql) {
    return null;
  }

  const offlineId = `offline_${shop}`;
  const attempts = [
    () => sql`
      SELECT "accessToken"
      FROM "Session"
      WHERE id = ${offlineId}
      LIMIT 1
    `,
    () => sql`
      SELECT "accessToken"
      FROM shopify_sessions."Session"
      WHERE id = ${offlineId}
      LIMIT 1
    `,
  ];

  for (const attempt of attempts) {
    try {
      const rows = await attempt();
      const token = readTokenFromRows(rows as SessionRow[]);
      if (token) {
        return token;
      }
    } catch {
      // continue
    }
  }

  return null;
};

export const getShopifyOfflineAccessToken = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  if (!shop.endsWith('.myshopify.com')) {
    return null;
  }

  const merchantToken = await getMerchantStoredAccessToken(shop);
  if (merchantToken) {
    return merchantToken;
  }

  const prismaAttempts = [
    queryByOfflineSessionId,
    queryOfflineFromShopifySessionsSchema,
    queryOfflineFromPublic,
    queryAnyFromShopifySessionsSchema,
    queryAnyFromPublic,
  ];

  for (const attempt of prismaAttempts) {
    try {
      const token = await attempt(shop);
      if (token) {
        return token;
      }
    } catch {
      // Table may live in a different schema on this database.
    }
  }

  return null;
};

export const requireShopifyOfflineAccessToken = async (shopDomain: string) => {
  const { ensureShopifyOfflineAccessToken } = await import(
    '@/lib/server/billing/refresh-shopify-session'
  );
  const token = await ensureShopifyOfflineAccessToken(shopDomain);
  if (token) {
    return token;
  }

  throw new Error(
    'No Shopify session for this store. Open Push Eagle from Shopify admin (Apps → Push Eagle) once to connect billing, wait for the dashboard to load, then try Plans again.',
  );
};
