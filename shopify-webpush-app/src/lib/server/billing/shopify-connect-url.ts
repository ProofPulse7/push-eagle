import { env } from '@/lib/config/env';

import {
  appendShopifyAdminParams,
  type ShopifyAdminSearchParams,
} from '@/lib/server/billing/shopify-admin-params';

const pickParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const buildShopifyAppConnectUrl = (
  shopDomain: string,
  shopifyParams?: ShopifyAdminSearchParams,
) => {
  const shop = shopDomain.trim().toLowerCase();
  const root = (env.SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app').replace(/\/$/, '');
  const host = pickParam(shopifyParams?.host);
  const clientId = env.SHOPIFY_API_KEY?.trim();

  if (host) {
    const url = new URL(`${root}/app`);
    url.searchParams.set('shop', shop);
    if (shopifyParams) {
      appendShopifyAdminParams(url, shopifyParams, { includeShop: false });
    }
    return url.toString();
  }

  if (clientId) {
    const storeHandle = shop.replace('.myshopify.com', '');
    return `https://admin.shopify.com/store/${storeHandle}/oauth/install?client_id=${encodeURIComponent(clientId)}`;
  }

  const fallback = new URL(`${root}/app`);
  fallback.searchParams.set('shop', shop);
  if (shopifyParams) {
    appendShopifyAdminParams(fallback, shopifyParams, { includeShop: false });
  }
  return fallback.toString();
};
