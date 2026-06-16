import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { completeCronHeartbeat, listDueScheduledCampaigns, listQueuedCampaigns, sendCampaign, startCronHeartbeat } from '@/lib/server/data/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

const isAuthorized = (request: Request) => {
  // Vercel cron can arrive with varying header formats depending on platform/runtime.
  const vercelCronHeader = (request.headers.get('x-vercel-cron') ?? '').trim().toLowerCase();
  const userAgent = (request.headers.get('user-agent') ?? '').toLowerCase();
  if (vercelCronHeader === '1' || vercelCronHeader === 'true' || userAgent.includes('vercel-cron')) {
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
  let heartbeatId: string | null = null;
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

    heartbeatId = await startCronHeartbeat('process_campaigns', {
      shardCount,
      shardIndex,
      maxCampaigns,
      maxBatches,
      workerId,
    });

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

    const responsePayload = {
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
    };

    if (heartbeatId) {
      await completeCronHeartbeat({
        heartbeatId,
        ok: true,
        metadata: {
          candidateCount: uniqueCandidates.length,
          processedCount: responsePayload.processedCount,
          failedCount: responsePayload.failedCount,
        },
      });
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process scheduled campaigns.';
    if (heartbeatId) {
      await completeCronHeartbeat({
        heartbeatId,
        ok: false,
        errorMessage: message,
      });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}