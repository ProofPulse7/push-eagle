import { NextResponse } from 'next/server';

import { completeShopifyOAuthCallback } from '@/lib/server/shopify/oauth-callback';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const result = await completeShopifyOAuthCallback(request);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const response = NextResponse.redirect(result.redirectTo, { status: 302 });
  response.cookies.set('pe_shop', new URL(result.redirectTo).searchParams.get('shop') || '', {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
    secure: true,
  });
  return response;
}
