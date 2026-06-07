import { env } from '@/lib/config/env';

export const buildShopifyAppConnectUrl = (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const root = (env.SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app').replace(/\/$/, '');
  return `${root}/app?shop=${encodeURIComponent(shop)}`;
};
