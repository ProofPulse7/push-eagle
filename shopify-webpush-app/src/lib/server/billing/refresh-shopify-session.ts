import { callPushEagleBilling } from '@/lib/server/billing/push-eagle-client';
import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';

export const refreshShopifySessionFromRemixApp = async (shopDomain: string) => {
  try {
    await callPushEagleBilling('/api/shopify/session/sync', shopDomain, {});
    return true;
  } catch {
    return false;
  }
};

export const ensureShopifyOfflineAccessToken = async (shopDomain: string) => {
  let token = await getShopifyOfflineAccessToken(shopDomain);
  if (token) {
    return token;
  }

  await refreshShopifySessionFromRemixApp(shopDomain);
  token = await getShopifyOfflineAccessToken(shopDomain);
  if (token) {
    return token;
  }

  return null;
};
