import { readOfflineAccessTokenFromPrismaSessions } from '@/lib/server/billing/prisma-session-import';
import { getShopifyStoreCredentials } from '@/lib/server/billing/shopify-credentials-store';
import { ensureShopifyOfflineAccessToken } from '@/lib/server/billing/refresh-shopify-session';
import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';

/**
 * Hot-path token lookup for billing checkout.
 * Uses stored credentials only — no GraphQL validation or remix sync.
 * Shopify recommends using the offline token from OAuth and calling
 * appSubscriptionCreate, then redirecting to confirmationUrl immediately.
 */
export const resolveBillingAccessTokenFast = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();

  const [credentials, sessionToken, prismaToken] = await Promise.all([
    getShopifyStoreCredentials(shop),
    getShopifyOfflineAccessToken(shop),
    readOfflineAccessTokenFromPrismaSessions(shop),
  ]);

  return (
    credentials?.offlineAccessToken ??
    sessionToken ??
    prismaToken ??
    null
  );
};

export const isShopifyAuthError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('invalid api key or access token') ||
    message.includes('access token')
  );
};

export const resolveBillingAccessTokenForCheckout = async (shopDomain: string) => {
  const fast = await resolveBillingAccessTokenFast(shopDomain);
  if (fast) {
    return fast;
  }

  return ensureShopifyOfflineAccessToken(shopDomain);
};
