import type { QueryClient } from '@tanstack/react-query';

import { resolveAnalyticsDateRange } from '@/lib/client/analytics-date-range';
import { mergeCampaignsFromCache } from '@/lib/client/optimistic-campaigns';
import { mergeAutomationOverviewPayload } from '@/lib/client/optimistic-automations';
import { syncMerchantStatsCaches } from '@/lib/client/merchant-combined-stats';
import { queryKeys } from '@/lib/client/query-keys';

export type AppBootstrapPayload = {
  ok: true;
  shopDomain: string;
  merchantOverview: Record<string, unknown>;
  campaignStats: Record<string, unknown>;
  analyticsStats?: Record<string, unknown>;
  analyticsFrom?: string;
  analyticsTo?: string;
  subscriberKpis: Record<string, unknown>;
  subscriberOverview?: Record<string, unknown>;
  subscriberGrowth?: Record<string, unknown>;
  subscriberGrowthSeries?: Record<string, unknown>;
  automationsOverview?: Record<string, unknown>;
  campaigns: unknown[];
  segments: unknown[];
  attribution: Record<string, unknown>;
  privacy: Record<string, unknown>;
  branding: Record<string, unknown>;
  optIn: Record<string, unknown>;
  billing?: Record<string, unknown>;
};

export const hydrateAppCache = (
  queryClient: QueryClient,
  shop: string,
  payload: AppBootstrapPayload,
) => {
  const shopDomain = payload.shopDomain || shop;

  queryClient.setQueryData(queryKeys.merchantOverview(shopDomain), {
    ok: true,
    ...payload.merchantOverview,
  });

  queryClient.setQueryData(
    queryKeys.campaigns(shopDomain),
    mergeCampaignsFromCache(queryClient, shopDomain, {
      ok: true,
      campaigns: payload.campaigns,
    }),
  );

  if (payload.automationsOverview?.rules) {
    queryClient.setQueryData(
      queryKeys.automationsOverview(shopDomain),
      mergeAutomationOverviewPayload(
        queryClient.getQueryData(queryKeys.automationsOverview(shopDomain)),
        {
          ok: true,
          ...payload.automationsOverview,
        },
        shopDomain,
      ),
    );
  }

  queryClient.setQueryData(queryKeys.segments(shopDomain), {
    ok: true,
    segments: payload.segments,
  });

  queryClient.setQueryData(queryKeys.attribution(shopDomain), {
    ok: true,
    shopDomain,
    ...payload.attribution,
  });

  queryClient.setQueryData(queryKeys.privacy(shopDomain), {
    ok: true,
    shopDomain,
    ...payload.privacy,
  });

  queryClient.setQueryData(queryKeys.branding(shopDomain), {
    ok: true,
    shopDomain,
    ...payload.branding,
  });

  queryClient.setQueryData(queryKeys.optIn(shopDomain), {
    ok: true,
    shopDomain,
    ...payload.optIn,
  });

  if (payload.subscriberOverview) {
    queryClient.setQueryData(queryKeys.subscribersOverview(shopDomain), {
      ok: true,
      shopDomain,
      ...payload.subscriberOverview,
    });
  } else if (payload.subscriberKpis) {
    queryClient.setQueryData(queryKeys.subscribersOverview(shopDomain), {
      ok: true,
      shopDomain,
      ...payload.subscriberKpis,
    });
  }

  const defaultRange = resolveAnalyticsDateRange();

  queryClient.setQueryData(queryKeys.dashboardSummary(shopDomain), {
    overview: payload.merchantOverview,
    campaignStats: payload.campaignStats,
    subscriberKpis: payload.subscriberKpis,
    billing: payload.billing ?? {},
    automationTotals: payload.automationsOverview?.totals ?? {},
  });

  queryClient.setQueryData(
    queryKeys.campaignStats(shopDomain, defaultRange.fromIso, defaultRange.toIso),
    {
      ok: true,
      stats: payload.campaignStats,
    },
  );

  queryClient.setQueryData(queryKeys.campaignStats(shopDomain, 'all', 'all'), {
    ok: true,
    stats: payload.campaignStats,
  });

  if (payload.automationsOverview) {
    queryClient.setQueryData(queryKeys.automationStats(shopDomain, 'all', 'all'), {
      ok: true,
      rules: payload.automationsOverview.rules ?? [],
      totals: payload.automationsOverview.totals ?? {},
    });
    queryClient.setQueryData(
      queryKeys.automationStats(shopDomain, defaultRange.fromIso, defaultRange.toIso),
      {
        ok: true,
        rules: payload.automationsOverview.rules ?? [],
        totals: payload.automationsOverview.totals ?? {},
      },
    );
  }

  const analyticsFrom = payload.analyticsFrom ?? defaultRange.fromIso;
  const analyticsTo = payload.analyticsTo ?? defaultRange.toIso;
  if (payload.analyticsStats) {
    queryClient.setQueryData(queryKeys.analyticsStats(shopDomain, analyticsFrom, analyticsTo), {
      ok: true,
      ...payload.analyticsStats,
    });
  }

  if (payload.billing) {
    queryClient.setQueryData(queryKeys.billingStatus(shopDomain), {
      ok: true,
      billing: payload.billing,
    });
  }

  if (payload.subscriberGrowthSeries ?? payload.subscriberGrowth) {
    const series = payload.subscriberGrowthSeries ?? payload.subscriberGrowth;
    queryClient.setQueryData(queryKeys.subscribersGrowthSeries(shopDomain), series);
  }

  syncMerchantStatsCaches(queryClient, shopDomain);
};
