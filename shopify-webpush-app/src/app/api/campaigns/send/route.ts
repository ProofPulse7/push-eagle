import { NextResponse } from 'next/server';
import { z } from 'zod';

import { invalidateShopDashboardCaches } from '@/lib/server/cache/api-kv-cache';
import { deliverCampaignUntilComplete } from '@/lib/server/campaigns/deliver-campaign';
import { deferAfterResponse } from '@/lib/server/defer-after-response';
import { getCampaignById, countCampaignAudienceTokens, requeueCampaignForDelivery } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';
export const maxDuration = 300;

const schema = z.object({
  shopDomain: z.string().optional(),
  campaignId: z.string().min(1),
  async: z.boolean().optional(),
  maxBatches: z.number().int().min(1).max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const maxBatches = body.maxBatches ?? 2000;
    const runAsync = body.async === true;

    const { invalidateShopDashboardCaches: invalidateCaches } = await import('@/lib/server/cache/api-kv-cache');

    if (runAsync) {
      const campaign = await getCampaignById(shopDomain, body.campaignId);
      const recipientCount = campaign
        ? await countCampaignAudienceTokens(
            shopDomain,
            (campaign as { segment_id?: string | null }).segment_id ?? null,
          )
        : null;

      void invalidateCaches(shopDomain);

      deferAfterResponse(async () => {
        try {
          await deliverCampaignUntilComplete(shopDomain, body.campaignId, { maxBatches, maxRounds: 60 });
        } catch (error) {
          console.error('[campaigns/send] background delivery failed', {
            shopDomain,
            campaignId: body.campaignId,
            error: error instanceof Error ? error.message : String(error),
          });
          await requeueCampaignForDelivery(shopDomain, body.campaignId).catch(() => undefined);
        } finally {
          void invalidateCaches(shopDomain);
        }
      });

      return NextResponse.json({
        ok: true,
        campaignId: body.campaignId,
        async: true,
        queued: true,
        completed: false,
        successCount: 0,
        recipientCount,
        targetRecipientCount: recipientCount,
        remainingRecipients: recipientCount,
        message: 'Campaign delivery started in the background.',
      });
    }

    const result = await deliverCampaignUntilComplete(shopDomain, body.campaignId, { maxBatches, maxRounds: 60 });
    void invalidateCaches(shopDomain);

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
