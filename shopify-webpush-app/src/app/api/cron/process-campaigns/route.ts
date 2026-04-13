import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { listDueScheduledCampaigns, listQueuedCampaigns, sendCampaign } from '@/lib/server/data/store';

export const runtime = 'nodejs';
export const maxDuration = 300;

const isAuthorized = (request: Request) => {
  if (!env.CRON_SECRET) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${env.CRON_SECRET}`;
};

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized cron request.' }, { status: 401 });
    }

    const dueCampaigns = await listDueScheduledCampaigns(25);
    const queuedCampaigns = await listQueuedCampaigns(25);
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
        const result = await sendCampaign(campaign.shop_domain, campaign.id, { maxBatches: 20 });
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