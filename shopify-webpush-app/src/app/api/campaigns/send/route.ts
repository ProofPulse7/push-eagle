import { NextResponse } from 'next/server';
import { z } from 'zod';

import { deferAfterResponse } from '@/lib/server/defer-after-response';
import { sendCampaign } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';
export const maxDuration = 300;

const schema = z.object({
  campaignId: z.string().min(1),
  shopDomain: z.string().optional(),
  maxBatches: z.number().int().min(1).max(2000).optional(),
  async: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const maxBatches = body.maxBatches ?? 20;
    const runAsync = body.async !== false;

    if (runAsync) {
      deferAfterResponse(async () => {
        try {
          await sendCampaign(shopDomain, body.campaignId, { maxBatches });
        } finally {
          const { invalidateShopDashboardCaches } = await import('@/lib/server/cache/api-kv-cache');
          void invalidateShopDashboardCaches(shopDomain);
        }
      });

      return NextResponse.json({
        ok: true,
        campaignId: body.campaignId,
        async: true,
        queued: true,
        completed: false,
        successCount: 0,
        recipientCount: null,
        remainingRecipients: null,
        message: 'Campaign delivery started in the background.',
      });
    }

    const result = await sendCampaign(shopDomain, body.campaignId, { maxBatches });

    return NextResponse.json({
      ok: true,
      campaignId: body.campaignId,
      async: false,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
