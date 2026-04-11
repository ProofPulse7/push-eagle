import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { listDueScheduledCampaigns, sendCampaign } from '@/lib/server/data/store';

export const runtime = 'nodejs';

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
    const processed: Array<{
      campaignId: string;
      shopDomain: string;
      successCount?: number;
      failureCount?: number;
      recipientCount?: number;
      error?: string;
    }> = [];

    for (const campaign of dueCampaigns) {
      try {
        const result = await sendCampaign(campaign.shop_domain, campaign.id);
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
      processedCount: processed.filter((item) => !item.error).length,
      failedCount: processed.filter((item) => Boolean(item.error)).length,
      processed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process scheduled campaigns.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}