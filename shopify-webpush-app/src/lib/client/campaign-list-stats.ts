import { isWithinInterval } from 'date-fns';
import type { DateRange } from 'react-day-picker';

import { applyLaunchMediaToCampaign } from '@/lib/client/campaign-launch-media-cache';
import { resolveCampaignRowMetrics } from '@/lib/client/campaign-row-metrics';

export type CampaignListStatRow = {
  status: 'Sent' | 'Scheduled' | 'Draft' | 'Archived' | 'Paused' | 'Sending';
  sendTime: string;
  impressions: number;
  deliveryCount: number;
  clickCount: number;
  revenueCents: number;
};

export const mapCampaignRecordForStats = (
  shop: string,
  campaign: Record<string, unknown>,
): CampaignListStatRow => {
  const enriched = applyLaunchMediaToCampaign(shop, campaign);
  const metrics = resolveCampaignRowMetrics(enriched);

  return {
    status: metrics.status,
    sendTime: metrics.sendTime,
    impressions: metrics.impressions,
    deliveryCount: metrics.deliveryCount,
    clickCount: metrics.clickCount,
    revenueCents: metrics.revenueCents,
  };
};

export const aggregateCampaignListStats = (
  campaigns: Record<string, unknown>[],
  shop: string,
  dateRange?: DateRange,
) => {
  const rows = campaigns
    .map((campaign) => mapCampaignRecordForStats(shop, campaign))
    .filter((campaign) => campaign.status === 'Sent' || campaign.status === 'Sending');

  const filtered = !dateRange?.from
    ? rows
    : rows.filter((campaign) => {
        try {
          const campaignDate = new Date(campaign.sendTime);
          if (Number.isNaN(campaignDate.getTime())) {
            return false;
          }
          const toDate = dateRange.to ?? dateRange.from!;
          return isWithinInterval(campaignDate, { start: dateRange.from!, end: toDate });
        } catch {
          return false;
        }
      });

  const impressions = filtered.reduce((sum, campaign) => sum + campaign.impressions, 0);
  const clicks = filtered.reduce((sum, campaign) => sum + campaign.clickCount, 0);
  const revenueCents = filtered.reduce((sum, campaign) => sum + campaign.revenueCents, 0);

  return {
    impressions,
    clicks,
    avgCtrPercent: impressions > 0 ? (clicks / impressions) * 100 : 0,
    revenueCents,
  };
};
