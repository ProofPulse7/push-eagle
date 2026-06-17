import { NextResponse } from 'next/server';

import { buildShopifyAppConnectUrl } from '@/lib/server/billing/shopify-connect-url';
import { requireShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import { buildDashboardSsoRedirectUrl } from '@/lib/server/shopify/dashboard-sso';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const resolveRedirectPath = (returnTo: string | null, requestUrl: URL) => {
  if (!returnTo) {
    return '/dashboard';
  }

  try {
    const parsed = new URL(returnTo);
    if (parsed.origin === requestUrl.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Fall back to dashboard.
  }

  return '/dashboard';
};

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const shopDomain = extractShopDomain(request);
    const returnTo = requestUrl.searchParams.get('return_to');
    const redirectPath = resolveRedirectPath(returnTo, requestUrl);
    const host = requestUrl.searchParams.get('host');
    const embedded = requestUrl.searchParams.get('embedded');

    const cookieHeader = request.headers.get('cookie') ?? '';
    const authenticated = cookieHeader.includes('pe_authenticated=1');
    const cookieShop = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('pe_shop='))
      ?.slice('pe_shop='.length)
      ?.trim()
      .toLowerCase();

    if (authenticated && cookieShop === shopDomain) {
      const destination = new URL(redirectPath.startsWith('/') ? redirectPath : '/dashboard', requestUrl.origin);
      destination.searchParams.set('shop', shopDomain);
      return NextResponse.redirect(destination, { status: 302 });
    }

    try {
      await requireShopifyOfflineAccessToken(shopDomain);
      const ssoUrl = buildDashboardSsoRedirectUrl(requestUrl.origin, shopDomain, redirectPath, {
        host,
        embedded,
      });
      return NextResponse.redirect(ssoUrl, { status: 302 });
    } catch {
      const oauthUrl = new URL(buildShopifyAppConnectUrl(shopDomain, { host, embedded }));
      if (returnTo) {
        oauthUrl.searchParams.set('return_to', returnTo);
      }
      return NextResponse.redirect(oauthUrl.toString(), { status: 302 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to connect store.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
