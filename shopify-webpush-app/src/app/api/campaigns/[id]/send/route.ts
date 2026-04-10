import { NextResponse } from 'next/server';
import { z } from 'zod';

import { sendCampaign } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const bodySchema = z.object({
  shopDomain: z.string().optional(),
});

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const result = await sendCampaign(shopDomain, context.params.id);

    return NextResponse.json({
      ok: true,
      campaignId: context.params.id,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
