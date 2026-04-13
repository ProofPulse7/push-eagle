import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAttributedConversion } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Domain',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const shopDomain = parseShopDomain(body.shopDomain);

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

    return NextResponse.json({ ok: true, shopDomain, orderId: body.orderId, ...result }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process storefront conversion.';
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: corsHeaders });
  }
}
