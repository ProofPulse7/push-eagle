import type { QueryClient } from '@tanstack/react-query';

import { resolveAnalyticsDateRange } from '@/lib/client/analytics-date-range';
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
  automationsOverview: Record<string, unknown>;
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

  queryClient.setQueryData(queryKeys.campaigns(shopDomain), {
    ok: true,
    campaigns: payload.campaigns,
  });

  queryClient.setQueryData(queryKeys.automationsOverview(shopDomain), {
    ok: true,
    ...payload.automationsOverview,
  });

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
    ok: true,
    merchantOverview: payload.merchantOverview,
    campaignStats: payload.campaignStats,
    subscriberKpis: payload.subscriberKpis,
  });

  queryClient.setQueryData(
    queryKeys.campaignStats(shopDomain, defaultRange.fromIso, defaultRange.toIso),
    {
      ok: true,
      stats: payload.campaignStats,
    },
  );

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
};
