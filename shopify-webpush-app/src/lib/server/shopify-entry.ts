import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import { refreshShopifySessionFromRemixApp } from '@/lib/server/billing/refresh-shopify-session';
import { env } from '@/lib/config/env';
import { normalizeShopDomain } from '@/lib/server/shop-context';

const SHOPIFY_LAUNCH_PARAMS = [
  'host',
  'id_token',
  'session',
  'timestamp',
  'hmac',
  'embedded',
  'locale',
  'login_hint',
] as const;

const pickParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const isShopifyAdminLaunch = (params: Record<string, string | string[] | undefined>) =>
  Boolean(pickParam(params.host) || pickParam(params.id_token));

const appendLaunchParams = (
  target: URL,
  params: Record<string, string | string[] | undefined>,
) => {
  for (const key of SHOPIFY_LAUNCH_PARAMS) {
    const value = pickParam(params[key]);
    if (value) {
      target.searchParams.set(key, value);
    }
  }
};

export const buildOAuthHandoffUrl = (
  shopDomain: string,
  returnTo: string,
  launchParams?: Record<string, string | string[] | undefined>,
) => {
  const root = env.SHOPIFY_ROOT_APP_URL.replace(/\/$/, '');
  const url = new URL('/app', root);
  url.searchParams.set('shop', shopDomain);
  url.searchParams.set('return_to', returnTo);

  if (launchParams) {
    appendLaunchParams(url, launchParams);
  }

  return url.toString();
};

export const persistShopCookie = async (shopDomain: string) => {
  const cookieStore = await cookies();
  cookieStore.set('pe_shop', shopDomain, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    secure: true,
    sameSite: 'lax',
  });
};

/**
 * When opened from Shopify Admin, ensure we have an offline token.
 * If missing, hand off once to the Remix app with all Shopify launch params preserved.
 */
export const ensureShopifyOAuthHandoff = async (input: {
  searchParams: Record<string, string | string[] | undefined>;
  returnPath: string;
}) => {
  const shopRaw = pickParam(input.searchParams.shop);

  if (!shopRaw || !isShopifyAdminLaunch(input.searchParams)) {
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
    await persistShopCookie(shopDomain);
    return;
  }

  const returnTo = new URL(input.returnPath, env.NEXT_PUBLIC_APP_URL);
  returnTo.searchParams.set('shop', shopDomain);
  redirect(buildOAuthHandoffUrl(shopDomain, returnTo.toString(), input.searchParams));
};
