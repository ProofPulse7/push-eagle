import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/client/query-keys';
import type { AppBootstrapPayload } from '@/lib/client/hydrate-app-cache';

export type DashboardSummaryPayload = {
  overview: Record<string, unknown>;
  campaignStats: Record<string, unknown>;
  subscriberKpis: Record<string, unknown>;
  billing: Record<string, unknown>;
  automationTotals?: Record<string, unknown>;
};

export const readDashboardSummaryFromCache = (
  queryClient: QueryClient,
  shop: string,
): DashboardSummaryPayload | undefined => {
  if (!shop) {
    return undefined;
  }

  const existing = queryClient.getQueryData<DashboardSummaryPayload>(queryKeys.dashboardSummary(shop));
  if (existing) {
    return existing;
  }

  const bootstrap = queryClient.getQueryData<AppBootstrapPayload>(queryKeys.bootstrap(shop));
  const overview =
    queryClient.getQueryData<Record<string, unknown>>(queryKeys.merchantOverview(shop)) ??
    bootstrap?.merchantOverview;
  const subscriberKpis =
    queryClient.getQueryData<Record<string, unknown>>(queryKeys.subscribersOverview(shop)) ??
    bootstrap?.subscriberKpis;
  const billingPayload = queryClient.getQueryData<{ billing?: Record<string, unknown> }>(
    queryKeys.billingStatus(shop),
  );

  if (!overview && !bootstrap?.merchantOverview) {
    return undefined;
  }

  return {
    overview: (overview ?? {}) as Record<string, unknown>,
    campaignStats: (bootstrap?.campaignStats ?? {}) as Record<string, unknown>,
    subscriberKpis: (subscriberKpis ?? {}) as Record<string, unknown>,
    billing: (billingPayload?.billing ?? bootstrap?.billing ?? {}) as Record<string, unknown>,
    automationTotals: (bootstrap?.automationsOverview?.totals ?? {}) as Record<string, unknown>,
  };
};
