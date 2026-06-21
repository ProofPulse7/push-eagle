import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAttributedConversion } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';
import { verifyStorefrontRequest } from '@/lib/server/storefront-request-auth';

export const runtime = 'nodejs';

const schema = z.object({
  shopDomain: z.string(),
  orderId: z.string().min(1),
  externalId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  revenue: z.number().nonnegative(),
  occurredAt: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
  browser: z.string().optional().nullable(),
  platform: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
});

const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Domain',
  Vary: 'Origin',
});

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  try {
    const body = schema.parse(await request.json());
    const shopDomain = parseShopDomain(body.shopDomain);

    const auth = await verifyStorefrontRequest(request, shopDomain);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized storefront conversion request.' },
        { status: 401, headers: buildCorsHeaders(origin) },
      );
    }

    const result = await recordAttributedConversion({
      shopDomain,
      orderId: body.orderId,
      externalId: body.externalId,
      customerId: body.customerId,
      email: body.email,
      campaignId: body.campaignId,
      revenueCents: Math.round(body.revenue * 100),
      occurredAt: body.occurredAt,
      userAgent: body.userAgent,
      browser: body.browser,
      platform: body.platform,
      country: body.country,
    });

    return NextResponse.json(
      { ok: true, shopDomain, orderId: body.orderId, ...result },
      { headers: buildCorsHeaders(origin) },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process storefront conversion.';
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: buildCorsHeaders(origin) });
  }
}
