import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordAttributedConversion } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const conversionSchema = z.object({
  shopDomain: z.string().optional(),
  orderId: z.string().min(1),
  externalId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  occurredAt: z.string().optional().nullable(),
  revenueCents: z.number().int().nonnegative().optional(),
  revenue: z.number().nonnegative().optional(),
});

export async function POST(request: Request) {
  try {
    const body = conversionSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);

    const computedRevenueCents =
      body.revenueCents ??
      (typeof body.revenue === 'number' ? Math.round(body.revenue * 100) : 0);

    const result = await recordAttributedConversion({
      shopDomain,
      orderId: body.orderId,
      revenueCents: computedRevenueCents,
      occurredAt: body.occurredAt,
      externalId: body.externalId,
      campaignId: body.campaignId,
    });

    return NextResponse.json({
      ok: true,
      shopDomain,
      orderId: body.orderId,
      revenueCents: computedRevenueCents,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record conversion attribution.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
