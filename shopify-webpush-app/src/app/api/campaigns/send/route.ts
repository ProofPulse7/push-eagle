import { NextResponse } from 'next/server';
import { z } from 'zod';

import { sendCampaign } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';
export const maxDuration = 300;

const schema = z.object({
  campaignId: z.string().min(1),
  shopDomain: z.string().optional(),
  maxBatches: z.number().int().min(1).max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const result = await sendCampaign(shopDomain, body.campaignId, {
      maxBatches: body.maxBatches ?? 20,
    });

    return NextResponse.json({
      ok: true,
      campaignId: body.campaignId,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
