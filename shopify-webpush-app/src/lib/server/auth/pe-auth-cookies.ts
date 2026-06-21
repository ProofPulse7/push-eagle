import { NextResponse } from 'next/server';

export const PE_AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const applyPeAuthCookies = (response: NextResponse, shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();

  response.cookies.set('pe_shop', shop, {
    path: '/',
    maxAge: PE_AUTH_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: true,
  });
  response.cookies.set('pe_authenticated', '1', {
    path: '/',
    maxAge: PE_AUTH_COOKIE_MAX_AGE,
    sameSite: 'lax',
    secure: true,
    httpOnly: true,
  });

  return response;
};

export const buildAuthenticatedAppRedirect = (
  requestUrl: URL,
  shopDomain: string,
  redirectPath: string,
  options?: { host?: string | null; embedded?: string | null },
) => {
  const destination = new URL(redirectPath.startsWith('/') ? redirectPath : '/dashboard', requestUrl.origin);
  destination.searchParams.set('shop', shopDomain.trim().toLowerCase());

  if (options?.host) {
    destination.searchParams.set('host', options.host);
  }
  if (options?.embedded) {
    destination.searchParams.set('embedded', options.embedded);
  }

  return applyPeAuthCookies(NextResponse.redirect(destination, { status: 302 }), shopDomain);
};
