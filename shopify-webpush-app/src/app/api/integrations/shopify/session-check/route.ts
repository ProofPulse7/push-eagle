import { NextResponse } from 'next/server';

import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

/** Lightweight auth probe for embedded App Bridge bootstrap (httpOnly cookies are not readable client-side). */
export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const authenticated =
      request.headers
        .get('cookie')
        ?.split(';')
        .some((part) => part.trim() === 'pe_authenticated=1') ?? false;

    return NextResponse.json({
      ok: true,
      shopDomain,
      authenticated,
    });
  } catch {
    return NextResponse.json({ ok: true, authenticated: false });
  }
}
