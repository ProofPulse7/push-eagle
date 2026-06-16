import { NextResponse } from 'next/server';
import { z } from 'zod';

import { processCampaignDeliveryJob } from '@/lib/server/campaigns/campaign-send-queue';
import { invalidateShopDashboardCaches } from '@/lib/server/cache/api-kv-cache';
import { env } from '@/lib/config/env';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';
export const maxDuration = 300;

const bodySchema = z.object({
  shopDomain: z.string().optional(),
  campaignId: z.string().min(1),
  maxBatches: z.number().int().min(1).max(2000).optional(),
});

const isAuthorized = (request: Request) => {
  if (!env.CRON_SECRET) {
    return false;
  }

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const xSecret = request.headers.get('x-automation-secret') ?? '';
  const querySecret = new URL(request.url).searchParams.get('secret') ?? '';
  return bearer === env.CRON_SECRET || xSecret === env.CRON_SECRET || querySecret === env.CRON_SECRET;
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);

    const result = await processCampaignDeliveryJob(shopDomain, body.campaignId, {
      maxBatches: body.maxBatches,
    });

    void invalidateShopDashboardCaches(shopDomain);

    return NextResponse.json({
      ok: true,
      shopDomain,
      campaignId: body.campaignId,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process campaign send.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
