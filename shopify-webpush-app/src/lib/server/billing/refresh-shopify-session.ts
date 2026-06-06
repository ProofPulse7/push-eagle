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

export const refreshShopifySessionLocally = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const token = await readOfflineAccessTokenFromPrismaSessions(shop);
  if (!token) {
    return { ok: false as const, error: 'No Prisma Session row for this shop.' };
  }

  if (!(await validateShopifyAccessToken(shop, token))) {
    return { ok: false as const, error: 'Prisma session token is invalid or expired.' };
  }

  const persisted = await persistShopifyOfflineToken({
    shopDomain: shop,
    offlineAccessToken: token,
    source: 'local_prisma_session_sync',
  });

  if (!persisted.saved || !persisted.valid) {
    return { ok: false as const, error: 'Could not persist offline token from Prisma session.' };
  }

  return { ok: true as const, result: { synced: true, shopDomain: shop } };
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

  const refreshed = await refreshOfflineAccessToken(shop);
  if (refreshed && (await validateShopifyAccessToken(shop, refreshed))) {
    return refreshed;
  }

  let token = await getShopifyOfflineAccessToken(shop);
  if (token && (await validateShopifyAccessToken(shop, token))) {
    return token;
  }

  if (token) {
    await markShopifyStoreCredentialsInvalid(shop);
    await clearMerchantOfflineAccessToken(shop);
    await purgeStalePrismaSessionForShop(shop);
  }

  const localSync = await refreshShopifySessionLocally(shop);
  if (localSync.ok) {
    token = await getShopifyOfflineAccessToken(shop);
    if (token && (await validateShopifyAccessToken(shop, token))) {
      return token;
    }
  }

  token = await healFromPrismaSessionTable(shop);
  if (token) {
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
