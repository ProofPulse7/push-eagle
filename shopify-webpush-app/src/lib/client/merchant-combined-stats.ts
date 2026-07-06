import type { QueryClient } from '@tanstack/react-query';

import {
  aggregateCampaignListStats,
  mapCampaignRecordForStats,
} from '@/lib/client/campaign-list-stats';
import type { DashboardSummaryPayload } from '@/lib/client/query-fetchers';
import { queryKeys } from '@/lib/client/query-keys';
import { resolveAnalyticsDateRange } from '@/lib/client/analytics-date-range';

export type MerchantDeliveryTotals = {
  impressions: number;
  clicks: number;
  revenueCents: number;
};

export type MerchantCampaignStatusCounts = {
  sentCount: number;
  scheduledCount: number;
};

export const countCampaignListStatuses = (
  campaigns: Record<string, unknown>[],
  shop: string,
): MerchantCampaignStatusCounts => {
  const rows = campaigns.map((campaign) => mapCampaignRecordForStats(shop, campaign));

  return {
    sentCount: rows.filter((row) => row.status === 'Sent' || row.status === 'Sending').length,
    scheduledCount: rows.filter((row) => row.status === 'Scheduled').length,
  };
};

export const deriveCampaignTotalsFromList = (
  campaigns: Record<string, unknown>[],
  shop: string,
) => {
  const delivery = aggregateCampaignListStats(campaigns, shop);
  const statusCounts = countCampaignListStatuses(campaigns, shop);

  return {
    ...delivery,
    ...statusCounts,
  };
};

export const readCampaignsFromCache = (queryClient: QueryClient, shop: string) => {
  const payload = queryClient.getQueryData<{ campaigns?: unknown[] }>(queryKeys.campaigns(shop));
  return Array.isArray(payload?.campaigns)
    ? (payload.campaigns as Record<string, unknown>[])
    : [];
};

export const readAutomationTotalsFromCache = (queryClient: QueryClient, shop: string) => {
  const stats = queryClient.getQueryData<{ totals?: MerchantDeliveryTotals }>(
    queryKeys.automationStats(shop, 'all', 'all'),
  );
  if (stats?.totals) {
    return {
      impressions: Number(stats.totals.impressions ?? 0),
      clicks: Number(stats.totals.clicks ?? 0),
      revenueCents: Number(stats.totals.revenueCents ?? 0),
    };
  }

  const overview = queryClient.getQueryData<{ totals?: MerchantDeliveryTotals }>(
    queryKeys.automationsOverview(shop),
  );
  if (overview?.totals) {
    return {
      impressions: Number(overview.totals.impressions ?? 0),
      clicks: Number(overview.totals.clicks ?? 0),
      revenueCents: Number(overview.totals.revenueCents ?? 0),
    };
  }

  return { impressions: 0, clicks: 0, revenueCents: 0 };
};

/** Keep dashboard, campaign stats, and automation stats caches aligned. */
export const syncMerchantStatsCaches = (queryClient: QueryClient, shop: string) => {
  if (!shop.trim()) {
    return;
  }

  const campaigns = readCampaignsFromCache(queryClient, shop);
  const campaignTotals = deriveCampaignTotalsFromList(campaigns, shop);
  const automationTotals = readAutomationTotalsFromCache(queryClient, shop);

  const campaignStatsPayload = {
    ok: true,
    impressions: campaignTotals.impressions,
    clicks: campaignTotals.clicks,
    avgCtrPercent: campaignTotals.avgCtrPercent,
    revenueCents: campaignTotals.revenueCents,
    sentCount: campaignTotals.sentCount,
    sent: campaignTotals.sentCount,
    scheduledCount: campaignTotals.scheduledCount,
    stats: {
      impressions: campaignTotals.impressions,
      clicks: campaignTotals.clicks,
      avgCtrPercent: campaignTotals.avgCtrPercent,
      revenueCents: campaignTotals.revenueCents,
      sentCount: campaignTotals.sentCount,
      sent: campaignTotals.sentCount,
      scheduledCount: campaignTotals.scheduledCount,
    },
  };

  const defaultRange = resolveAnalyticsDateRange();

  queryClient.setQueryData(queryKeys.campaignStats(shop, 'all', 'all'), campaignStatsPayload);
  queryClient.setQueryData(
    queryKeys.campaignStats(shop, defaultRange.fromIso, defaultRange.toIso),
    campaignStatsPayload,
  );

  const automationStatsPayload = queryClient.getQueryData<{
    ok?: boolean;
    rules?: unknown[];
    totals?: MerchantDeliveryTotals;
  }>(queryKeys.automationStats(shop, 'all', 'all'));

  queryClient.setQueryData(queryKeys.automationStats(shop, 'all', 'all'), {
    ok: true,
    rules: automationStatsPayload?.rules ?? [],
    totals: automationTotals,
  });
  queryClient.setQueryData(
    queryKeys.automationStats(shop, defaultRange.fromIso, defaultRange.toIso),
    {
      ok: true,
      rules: automationStatsPayload?.rules ?? [],
      totals: automationTotals,
    },
  );

  queryClient.setQueryData(queryKeys.dashboardSummary(shop), (current) => {
    const summary = (current ?? {}) as DashboardSummaryPayload;
    const overview = (summary.overview ?? {}) as Record<string, unknown>;

    return {
      ...summary,
      overview: {
        ...overview,
        campaignCount: campaignTotals.sentCount,
      },
      campaignStats: campaignStatsPayload,
      automationTotals,
    };
  });

  queryClient.setQueryData(queryKeys.automationsOverview(shop), (current) => {
    if (!current || typeof current !== 'object') {
      return current;
    }

    return {
      ...(current as Record<string, unknown>),
      totals: automationTotals,
    };
  });
};
