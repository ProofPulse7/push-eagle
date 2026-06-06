import { env } from '@/lib/config/env';
import { refreshShopifySessionFromRemixApp } from '@/lib/server/billing/refresh-shopify-session';
import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';

export const buildShopifyOAuthEntryUrl = (shopDomain: string, returnTo?: string) => {
  const root = env.SHOPIFY_ROOT_APP_URL.replace(/\/$/, '');
  const url = new URL('/app', root);
  url.searchParams.set('shop', shopDomain);

  if (returnTo) {
    url.searchParams.set('return_to', returnTo);
  }

  return url.toString();
};

export const getShopAuthStatus = async (shopDomain: string | null) => {
  if (!shopDomain) {
    return {
      shop: null,
      hasToken: false,
      needsAuth: true,
    };
  }

  await refreshShopifySessionFromRemixApp(shopDomain);
  const hasToken = Boolean(await getShopifyOfflineAccessToken(shopDomain));

  return {
    shop: shopDomain,
    hasToken,
    needsAuth: !hasToken,
  };
};
