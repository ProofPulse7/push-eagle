import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { listDueScheduledCampaigns, listQueuedCampaigns, sendCampaign } from '@/lib/server/data/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

const isAuthorized = (request: Request) => {
  // Vercel Cron invokes routes with x-vercel-cron header but no custom auth headers.
  if (request.headers.get('x-vercel-cron') === '1') {
    return true;
  }

  if (!env.CRON_SECRET) {
    return false;
  }

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const xSecret = request.headers.get('x-automation-secret') ?? '';
  const querySecret = new URL(request.url).searchParams.get('secret') ?? '';
  return bearer === env.CRON_SECRET || xSecret === env.CRON_SECRET || querySecret === env.CRON_SECRET;
};

const parsePositiveInt = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized cron request.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const shardCount = parsePositiveInt(url.searchParams.get('shardCount'), 1, 1, 128);
    const shardIndex = parsePositiveInt(url.searchParams.get('shardIndex'), 0, 0, shardCount - 1);
    const maxCampaigns = parsePositiveInt(url.searchParams.get('maxCampaigns'), 25, 1, 250);
    const maxBatches = parsePositiveInt(url.searchParams.get('maxBatches'), 20, 1, 2000);
    const workerId = request.headers.get('x-worker-id') ?? `worker-${shardIndex}`;

    const dueCampaigns = await listDueScheduledCampaigns(maxCampaigns, shardCount, shardIndex);
    const queuedCampaigns = await listQueuedCampaigns(maxCampaigns, shardCount, shardIndex);
    const candidates = [...dueCampaigns, ...queuedCampaigns];
    const uniqueCandidates = Array.from(new Map(candidates.map((item) => [item.id, item])).values());
    const processed: Array<{
      campaignId: string;
      shopDomain: string;
      successCount?: number;
      failureCount?: number;
      recipientCount?: number;
      completed?: boolean;
      remainingRecipients?: number;
      error?: string;
    }> = [];

    for (const campaign of uniqueCandidates) {
      try {
        const result = await sendCampaign(campaign.shop_domain, campaign.id, { maxBatches });
        processed.push({
          campaignId: campaign.id,
          shopDomain: campaign.shop_domain,
          ...result,
        });
      } catch (error) {
        processed.push({
          campaignId: campaign.id,
          shopDomain: campaign.shop_domain,
          error: error instanceof Error ? error.message : 'Failed to process scheduled campaign.',
        });
      }
    }

    return NextResponse.json({
      ok: true,
      workerId,
      shardCount,
      shardIndex,
      maxCampaigns,
      maxBatches,
      dueCount: dueCampaigns.length,
      queuedCount: queuedCampaigns.length,
      candidateCount: uniqueCandidates.length,
      processedCount: processed.filter((item) => !item.error).length,
      failedCount: processed.filter((item) => Boolean(item.error)).length,
      processed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process scheduled campaigns.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}