import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getRequestGeo } from '@/lib/server/request-geo';
import { recordIosHomeScreenConfirmed } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const bodySchema = z.object({
  shopDomain: z.string().min(3),
  externalId: z.string().min(1).max(200),
  browser: z.string().max(40).optional(),
  platform: z.string().max(40).optional(),
  locale: z.string().max(40).optional(),
  country: z.string().max(40).optional(),
  city: z.string().max(120).optional(),
  deviceContext: z.object({}).passthrough().optional(),
});

function addCorsHeaders(response: NextResponse, requestOrigin: string | null) {
  if (requestOrigin && /^https:\/\/[a-z0-9-]+\.myshopify\.com$/i.test(requestOrigin)) {
    response.headers.set('Access-Control-Allow-Origin', requestOrigin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'cache-control, content-type');
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  const response = new NextResponse(null, { status: 204 });
  addCorsHeaders(response, origin);
  return response;
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  try {
    const body = bodySchema.parse(await request.json());
    const shopDomain = parseShopDomain(body.shopDomain);
    const requestGeo = getRequestGeo(request);

    const result = await recordIosHomeScreenConfirmed({
      shopDomain,
      externalId: body.externalId,
      browser: body.browser ?? null,
      platform: body.platform ?? 'ios',
      locale: body.locale ?? null,
      country: body.country ?? requestGeo.country,
      city: body.city ?? requestGeo.city,
      deviceContext: body.deviceContext ?? null,
    });

    const response = NextResponse.json({
      ok: true,
      shopDomain,
      subscriberId: result.subscriberId,
      confirmedAt: result.confirmedAt,
      lastSeenAt: result.lastSeenAt,
    });
    addCorsHeaders(response, origin);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record iOS Home Screen state.';
    const response = NextResponse.json({ ok: false, error: message }, { status: 400 });
    addCorsHeaders(response, origin);
    return response;
  }
}