import { callPushEagleBilling } from '@/lib/server/billing/push-eagle-client';
import { readOfflineAccessTokenFromPrismaSessions } from '@/lib/server/billing/prisma-session-import';
import { persistShopifyOfflineToken } from '@/lib/server/billing/persist-shopify-token';
import {
  getShopifyStoreCredentials,
  markShopifyStoreCredentialsInvalid,
} from '@/lib/server/billing/shopify-credentials-store';
import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import {
  clearMerchantOfflineAccessToken,
  purgeStalePrismaSessionForShop,
  refreshOfflineAccessToken,
} from '@/lib/server/billing/shopify-offline-token-refresh';
import { validateShopifyAccessToken } from '@/lib/server/billing/shopify-token-validation';

export const refreshShopifySessionFromRemixApp = async (shopDomain: string) => {
  try {
    const result = await callPushEagleBilling('/api/shopify/session/sync', shopDomain, {});
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const healFromPrismaSessionTable = async (shopDomain: string) => {
  const token = await readOfflineAccessTokenFromPrismaSessions(shopDomain);
  if (!token) {
    return null;
  }

  const persisted = await persistShopifyOfflineToken({
    shopDomain,
    offlineAccessToken: token,
    source: 'prisma_public_session_import',
  });

  return persisted.valid ? token : null;
};

export const ensureShopifyOfflineAccessToken = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();

  let token = await getShopifyOfflineAccessToken(shop);
  if (token && (await validateShopifyAccessToken(shop, token))) {
    return token;
  }

  const refreshed = await refreshOfflineAccessToken(shop);
  if (refreshed && (await validateShopifyAccessToken(shop, refreshed))) {
    return refreshed;
  }

  if (token) {
    await markShopifyStoreCredentialsInvalid(shop);
    await clearMerchantOfflineAccessToken(shop);
    await purgeStalePrismaSessionForShop(shop);
  }

  const remixSync = await refreshShopifySessionFromRemixApp(shop);
  if (remixSync.ok) {
    token = await getShopifyOfflineAccessToken(shop);
    if (token && (await validateShopifyAccessToken(shop, token))) {
      return token;
    }
  }

  token = await healFromPrismaSessionTable(shop);
  if (token && (await validateShopifyAccessToken(shop, token))) {
    return token;
  }

  const credentials = await getShopifyStoreCredentials(shop);
  if (
    credentials?.offlineAccessToken &&
    (await validateShopifyAccessToken(shop, credentials.offlineAccessToken))
  ) {
    return credentials.offlineAccessToken;
  }

  return null;
};
