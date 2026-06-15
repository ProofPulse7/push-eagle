import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ROOT_APP_URL = (process.env.SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app').replace(
  /\/$/,
  '',
);

const PUBLIC_API_PREFIXES = [
  '/api/shopify/webhooks',
  '/api/storefront',
  '/api/integrations/shopify/sso',
  '/api/integrations/shopify/session-check',
  '/api/integrations/shopify/embedded-entry',
  '/api/auth',
  '/api/health',
  '/api/cron',
  '/api/admin',
  '/api/track',
  '/api/attribution/conversion',
  '/api/webhooks/events',
  '/api/billing/subscribe-redirect',
  '/api/billing/confirm',
];

const PUBLIC_PAGE_PREFIXES = ['/privacy', '/terms'];

const pickShop = (request: NextRequest) =>
  request.nextUrl.searchParams.get('shop')?.trim().toLowerCase() ||
  request.cookies.get('pe_shop')?.value?.trim().toLowerCase() ||
  null;

const isEmbeddedRequest = (request: NextRequest) => {
  const host = request.nextUrl.searchParams.get('host');
  const embedded = request.nextUrl.searchParams.get('embedded');
  return Boolean(host || embedded === '1');
};

const buildConnectRedirect = (request: NextRequest, shop: string) => {
  const connectUrl = new URL(`${ROOT_APP_URL}/app`);
  connectUrl.searchParams.set('shop', shop);

  const host = request.nextUrl.searchParams.get('host');
  const embedded = request.nextUrl.searchParams.get('embedded');
  if (host) {
    connectUrl.searchParams.set('host', host);
  }
  if (host || embedded === '1') {
    connectUrl.searchParams.set('embedded', '1');
  }

  connectUrl.searchParams.set('return_to', request.url);
  return NextResponse.redirect(connectUrl);
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    const shop = pickShop(request);
    const authenticated = request.cookies.get('pe_authenticated')?.value === '1';

    if (!shop || !authenticated) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized. Open Push Eagle from Shopify admin.' },
        { status: 401 },
      );
    }

    return NextResponse.next();
  }

  if (PUBLIC_PAGE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const shop = pickShop(request);
  if (!shop) {
    if (pathname === '/dashboard') {
      return NextResponse.redirect(`${ROOT_APP_URL}/`);
    }
    return NextResponse.next();
  }

  const authenticated =
    request.cookies.get('pe_authenticated')?.value === '1' ||
    request.nextUrl.searchParams.get('from_sso') === '1';

  if (!authenticated) {
    if (isEmbeddedRequest(request)) {
      const entry = new URL('/api/integrations/shopify/embedded-entry', request.url);
      entry.searchParams.set('shop', shop);
      const host = request.nextUrl.searchParams.get('host');
      const embedded = request.nextUrl.searchParams.get('embedded');
      if (host) {
        entry.searchParams.set('host', host);
      }
      entry.searchParams.set('embedded', embedded || '1');
      entry.searchParams.set(
        'return_to',
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      );
      return NextResponse.redirect(entry);
    }

    return buildConnectRedirect(request, shop);
  }

  const response = NextResponse.next();
  if (shop && !request.cookies.get('pe_shop')?.value) {
    response.cookies.set('pe_shop', shop, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: isEmbeddedRequest(request) ? 'none' : 'lax',
      secure: true,
    });
  }
  if (authenticated && !request.cookies.get('pe_client_auth')?.value) {
    response.cookies.set('pe_client_auth', '1', {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: isEmbeddedRequest(request) ? 'none' : 'lax',
      secure: true,
    });
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\..*).*)'],
};
