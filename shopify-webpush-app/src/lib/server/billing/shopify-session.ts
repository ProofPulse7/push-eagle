import { neon } from '@neondatabase/serverless';

import { isValidPostgresConnectionString, sanitizePostgresConnectionString } from '@/lib/config/sanitize-connection-string';
import { getShopifyStoreCredentials } from '@/lib/server/billing/shopify-credentials-store';
import {
  clearMerchantOfflineAccessToken,
  isObviouslyInvalidStoredToken,
  purgeStalePrismaSessionForShop,
} from '@/lib/server/billing/shopify-offline-token-refresh';
import { validateShopifyAccessToken } from '@/lib/server/billing/shopify-token-validation';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { env } from '@/lib/config/env';

type SessionRow = { accessToken: string };

export const hasShopifySessionDatabase = () => Boolean(env.SHOPIFY_SESSION_DATABASE_URL.trim());

const getPrismaSessionSql = () => {
  const url = sanitizePostgresConnectionString(env.SHOPIFY_SESSION_DATABASE_URL);
  if (!url || !isValidPostgresConnectionString(url)) {
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
    FROM public."Session"
    WHERE shop = ${shop}
      AND "isOnline" = false
    ORDER BY expires DESC NULLS LAST
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

const queryByOfflineSessionId = async (shop: string) => {
  const sql = getPrismaSessionSql();
  if (!sql) {
    return null;
  }

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

  const credentials = await getShopifyStoreCredentials(shop);
  if (credentials?.offlineAccessToken) {
    return credentials.offlineAccessToken;
  }

  const prismaAttempts = [
    queryByOfflineSessionId,
    queryOfflineFromShopifySessionsSchema,
    queryOfflineFromPublic,
  ];

  for (const attempt of prismaAttempts) {
    try {
      const token = await attempt(shop);
      if (token && !isObviouslyInvalidStoredToken(token)) {
        return token;
      }
    } catch {
      // Table may live in a different schema on this database.
    }
  }

  const merchantToken = await getMerchantStoredAccessToken(shop);
  if (merchantToken) {
    if (isObviouslyInvalidStoredToken(merchantToken)) {
      await clearMerchantOfflineAccessToken(shop);
    } else {
      return merchantToken;
    }
  }

  return null;
};

export const getValidatedShopifyOfflineAccessToken = async (shopDomain: string) => {
  const token = await getShopifyOfflineAccessToken(shopDomain);
  if (!token) {
    return null;
  }

  const valid = await validateShopifyAccessToken(shopDomain, token);
  if (valid) {
    return token;
  }

  await clearMerchantOfflineAccessToken(shopDomain);
  await purgeStalePrismaSessionForShop(shopDomain);
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
    'No valid Shopify session for this store. Open Push Eagle from Shopify admin (Apps → Push Eagle) once to refresh your connection, then try Plans again.',
  );
};
