import { redirect } from 'next/navigation';

import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import { refreshShopifySessionFromRemixApp } from '@/lib/server/billing/refresh-shopify-session';
import { env } from '@/lib/config/env';
import { normalizeShopDomain } from '@/lib/server/shop-context';

const pickParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const buildOAuthHandoffUrl = (shopDomain: string, returnTo: string) => {
  const root = env.SHOPIFY_ROOT_APP_URL.replace(/\/$/, '');
  const url = new URL('/app', root);
  url.searchParams.set('shop', shopDomain);
  url.searchParams.set('return_to', returnTo);
  return url.toString();
};

/**
 * When opened from Shopify Admin (`host` param), ensure we have an offline token.
 * If missing, hand off once to the Remix app for OAuth (no client-side redirect loops).
 */
export const ensureShopifyOAuthHandoff = async (input: {
  shop?: string | string[] | undefined;
  host?: string | string[] | undefined;
  returnPath: string;
}) => {
  const shopRaw = pickParam(input.shop);
  const host = pickParam(input.host);

  if (!shopRaw || !host) {
    return;
  }

  let shopDomain: string;
  try {
    shopDomain = normalizeShopDomain(shopRaw);
  } catch {
    return;
  }

  await refreshShopifySessionFromRemixApp(shopDomain);
  const hasToken = Boolean(await getShopifyOfflineAccessToken(shopDomain));
  if (hasToken) {
    return;
  }

  const returnTo = new URL(input.returnPath, env.NEXT_PUBLIC_APP_URL);
  returnTo.searchParams.set('shop', shopDomain);
  redirect(buildOAuthHandoffUrl(shopDomain, returnTo.toString()));
};
