import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { buildDashboardSsoUrl } from '@/lib/server/integrations/build-dashboard-sso-url';
import { resolveBillingAccessTokenFast } from '@/lib/server/billing/billing-access-token';
import { hasShopifySessionDatabase } from '@/lib/server/billing/shopify-session';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const ROOT_APP_URL = (env.SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app').replace(/\/$/, '');

const hasAuthCookie = (request: Request) =>
  request.headers
    .get('cookie')
    ?.split(';')
    .some((part) => part.trim() === 'pe_authenticated=1') ?? false;

const resolveReturnPath = (returnTo: string | null) => {
  if (!returnTo) {
    return '/dashboard';
  }

  try {
    const parsed = new URL(returnTo, env.NEXT_PUBLIC_APP_URL);
    const dashboardOrigin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
    if (parsed.origin !== dashboardOrigin) {
      return '/dashboard';
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return returnTo.startsWith('/') ? returnTo : '/dashboard';
  }
};

/** Fast embedded launch: server redirect to SSO or OAuth without loading dashboard HTML first. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shopDomain = parseShopDomain(url.searchParams.get('shop'));
    const host = url.searchParams.get('host');
    const embedded = url.searchParams.get('embedded');
    const returnPath = resolveReturnPath(url.searchParams.get('return_to'));

    if (hasAuthCookie(request)) {
      return NextResponse.redirect(new URL(returnPath, env.NEXT_PUBLIC_APP_URL));
    }

    const hasSession =
      hasShopifySessionDatabase() && Boolean(await resolveBillingAccessTokenFast(shopDomain));

    if (hasSession) {
      return NextResponse.redirect(
        buildDashboardSsoUrl(shopDomain, returnPath, { host, embedded: embedded || '1' }),
      );
    }

    const connectUrl = new URL(`${ROOT_APP_URL}/app`);
    connectUrl.searchParams.set('shop', shopDomain);
    if (host) {
      connectUrl.searchParams.set('host', host);
    }
    connectUrl.searchParams.set('embedded', '1');
    connectUrl.searchParams.set('return_to', new URL(returnPath, env.NEXT_PUBLIC_APP_URL).toString());

    return NextResponse.redirect(connectUrl.toString());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid embedded entry request.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
