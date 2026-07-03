import { NextResponse } from 'next/server';

import { getRequestGeo } from '@/lib/server/request-geo';
import { parseShopDomain } from '@/lib/server/shop-context';
import { verifyStorefrontBootstrapRequest } from '@/lib/server/storefront-request-auth';

export const runtime = 'nodejs';

function addCorsHeaders(response: NextResponse, requestOrigin: string | null) {
  if (requestOrigin && /^https:\/\/[a-z0-9-]+\.myshopify\.com$/i.test(requestOrigin)) {
    response.headers.set('Access-Control-Allow-Origin', requestOrigin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'cache-control, content-type');
    response.headers.set('Vary', 'Origin');
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
    const shopDomain = parseShopDomain(url.searchParams.get('shop'));

    const auth = await verifyStorefrontBootstrapRequest(request, shopDomain);
    if (!auth.ok) {
      const errResponse = NextResponse.json(
        { ok: false, error: 'Unauthorized storefront geo request.' },
        { status: 401 },
      );
      addCorsHeaders(errResponse, origin);
      return errResponse;
    }

    const geo = getRequestGeo(request);
    const response = NextResponse.json({
      ok: true,
      shopDomain,
      country: geo.country,
      city: geo.city,
    });
    addCorsHeaders(response, origin);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve storefront geo.';
    const errResponse = NextResponse.json({ ok: false, error: message }, { status: 400 });
    addCorsHeaders(errResponse, origin);
    return errResponse;
  }
}
