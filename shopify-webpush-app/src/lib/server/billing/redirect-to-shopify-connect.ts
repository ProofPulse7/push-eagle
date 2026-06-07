import { redirect } from 'next/navigation';

import { env } from '@/lib/config/env';
import { appendShopifyAdminParams } from '@/lib/server/billing/shopify-admin-params';
import { buildShopifyAppConnectUrl } from '@/lib/server/billing/shopify-connect-url';
import { getValidatedShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';

const pickParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const redirectToShopifyConnectIfNeeded = async (input: {
  shopDomain: string | null;
  returnPath: string;
  searchParams: Record<string, string | string[] | undefined>;
}) => {
  const { shopDomain, returnPath, searchParams } = input;
  if (!shopDomain) {
    return;
  }

  const token = await getValidatedShopifyOfflineAccessToken(shopDomain);
  if (token) {
    return;
  }

  // After one OAuth round-trip, stop redirecting to avoid loops if Remix sync failed.
  if (pickParam(searchParams.oauth_attempt) === '1') {
    return;
  }

  const returnTo = new URL(returnPath, env.NEXT_PUBLIC_APP_URL);
  returnTo.searchParams.set('shop', shopDomain);
  returnTo.searchParams.set('oauth_attempt', '1');
  appendShopifyAdminParams(returnTo, searchParams, { includeShop: false });

  const connectTarget = new URL(buildShopifyAppConnectUrl(shopDomain, searchParams));
  connectTarget.searchParams.set('return_to', returnTo.toString());
  redirect(connectTarget.toString());
};
