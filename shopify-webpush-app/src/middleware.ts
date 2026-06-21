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

const PUBLIC_PAGE_PREFIXES = ['/privacy', '/terms', '/auth/connecting'];

const pickShop = (request: NextRequest) =>
  request.nextUrl.searchParams.get('shop')?.trim().toLowerCase() ||
  request.cookies.get('pe_shop')?.value?.trim().toLowerCase() ||
  null;

const buildConnectRedirect = (request: NextRequest, shop: string) => {
  const connectUrl = new URL('/api/auth/connect', request.url);
  connectUrl.searchParams.set('shop', shop);

  const host = request.nextUrl.searchParams.get('host');
  const embedded = request.nextUrl.searchParams.get('embedded');
  if (host) {
    connectUrl.searchParams.set('host', host);
  }
  if (embedded) {
    connectUrl.searchParams.set('embedded', embedded);
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
    return buildConnectRedirect(request, shop);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\..*).*)'],
};
