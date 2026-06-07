import { env } from '@/lib/config/env';

import {
  appendShopifyAdminParams,
  type ShopifyAdminSearchParams,
} from '@/lib/server/billing/shopify-admin-params';

export const buildShopifyAppConnectUrl = (
  shopDomain: string,
  shopifyParams?: ShopifyAdminSearchParams,
) => {
  const shop = shopDomain.trim().toLowerCase();
  const root = (env.SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app').replace(/\/$/, '');
  const url = new URL(`${root}/app`);
  url.searchParams.set('shop', shop);

  if (shopifyParams) {
    appendShopifyAdminParams(url, shopifyParams, { includeShop: false });
  }

  return url.toString();
};
