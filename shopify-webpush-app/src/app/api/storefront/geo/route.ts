import { NextResponse } from 'next/server';

import { verifyShopifyAppProxySignature } from '@/lib/integrations/shopify/verify';
import { getRequestGeo } from '@/lib/server/request-geo';

export const runtime = 'nodejs';

// Geo is coarse (city/country of the caller's own IP) and non-sensitive, so we
// echo any storefront origin back to make it work on custom domains too.
function addCorsHeaders(response: NextResponse, requestOrigin: string | null) {
  if (requestOrigin && /^https:\/\/[a-z0-9.-]+$/i.test(requestOrigin)) {
    response.headers.set('Access-Control-Allow-Origin', requestOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'cache-control, content-type');
    response.headers.set('Vary', 'Origin');
  } else {
    response.headers.set('Access-Control-Allow-Origin', '*');
  }
  return response;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  const response = new NextResponse(null, { status: 204 });
  addCorsHeaders(response as unknown as NextResponse, origin);
  return response;
}

export async function GET(request: Request) {
  const origin = request.headers.get('origin');

  try {
    const url = new URL(request.url);

    // If a proxy signature is present, reject invalid ones; otherwise this is a
    // direct browser lookup which is allowed (returns only the caller's own geo).
    if (url.searchParams.has('signature') && !verifyShopifyAppProxySignature(url.searchParams)) {
      const errResponse = NextResponse.json({ ok: false, error: 'Invalid signature.' }, { status: 401 });
      addCorsHeaders(errResponse, origin);
      return errResponse;
    }

    const geo = getRequestGeo(request);
    const response = NextResponse.json(
      {
        ok: true,
        country: geo.country,
        city: geo.city,
        region: geo.region,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    addCorsHeaders(response, origin);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve storefront geo.';
    const errResponse = NextResponse.json({ ok: false, error: message }, { status: 400 });
    addCorsHeaders(errResponse, origin);
    return errResponse;
  }
}
