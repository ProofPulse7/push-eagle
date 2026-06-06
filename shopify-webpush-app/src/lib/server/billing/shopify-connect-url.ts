import { env } from '@/lib/config/env';

const DASHBOARD_URL = 'https://push-eagle-dashboard.vercel.app';

/** Send the merchant through Shopify install; OAuth returns to this dashboard app. */
export const buildShopifyAppConnectUrl = (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const storeHandle = shop.replace('.myshopify.com', '');
  const clientId = env.SHOPIFY_API_KEY.trim();

  if (clientId) {
    return `https://admin.shopify.com/store/${storeHandle}/oauth/install?client_id=${encodeURIComponent(clientId)}`;
  }

  const loginUrl = new URL('/auth/login', env.NEXT_PUBLIC_APP_URL || DASHBOARD_URL);
  loginUrl.searchParams.set('shop', shop);
  return loginUrl.toString();
};

export const buildDashboardEntryUrl = (shopDomain?: string) => {
  const url = new URL('/dashboard', env.NEXT_PUBLIC_APP_URL || DASHBOARD_URL);
  if (shopDomain) {
    url.searchParams.set('shop', shopDomain.trim().toLowerCase());
  }
  return url.toString();
};
