import { neon } from '@neondatabase/serverless';

import { env } from '@/lib/config/env';

type SessionRow = { accessToken: string };

const getSessionSql = () => {
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

const queryOfflineFromPublic = async (shop: string) => {
  const sql = getSessionSql();
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
  const sql = getSessionSql();
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
  const sql = getSessionSql();
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
  const sql = getSessionSql();
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

export const getShopifyOfflineAccessToken = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  if (!shop.endsWith('.myshopify.com')) {
    return null;
  }

  const attempts = [
    queryOfflineFromPublic,
    queryOfflineFromShopifySessionsSchema,
    queryAnyFromPublic,
    queryAnyFromShopifySessionsSchema,
  ];

  for (const attempt of attempts) {
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
  const token = await getShopifyOfflineAccessToken(shopDomain);
  if (token) {
    return token;
  }

  if (!env.SHOPIFY_SESSION_DATABASE_URL.trim()) {
    throw new Error(
      'Billing is not configured: set SHOPIFY_SESSION_DATABASE_URL on the dashboard (same Postgres URL as the Shopify app Session table).',
    );
  }

  throw new Error(
    'No Shopify session for this store. Open Push Eagle from Shopify admin once to install or re-authorize the app, then try again.',
  );
};
