import type { QueryClient } from '@tanstack/react-query';

import { resolveAnalyticsDateRange } from '@/lib/client/analytics-date-range';
import { queryKeys } from '@/lib/client/query-keys';

type AutomationStatsPayload = {
  ok?: boolean;
  rules?: unknown[];
  totals?: {
    impressions?: number;
    clicks?: number;
    revenueCents?: number;
  };
};

export const readAutomationStatsFromCache = (
  queryClient: QueryClient,
  shop: string,
  fromIso = 'all',
  toIso = 'all',
): AutomationStatsPayload | undefined => {
  if (!shop) {
    return undefined;
  }

  const direct = queryClient.getQueryData<AutomationStatsPayload>(
    queryKeys.automationStats(shop, fromIso, toIso),
  );
  if (direct) {
    return direct;
  }

  if (fromIso !== 'all' || toIso !== 'all') {
    return queryClient.getQueryData<AutomationStatsPayload>(
      queryKeys.automationStats(shop, 'all', 'all'),
    );
  }

  const overview = queryClient.getQueryData<AutomationStatsPayload>(queryKeys.automationsOverview(shop));
  if (!overview) {
    return undefined;
  }

  return {
    ok: true,
    rules: overview.rules ?? [],
    totals: overview.totals,
  };
};

export const resolveDefaultAutomationStatsRange = () => {
  const range = resolveAnalyticsDateRange();
  return { fromIso: range.fromIso, toIso: range.toIso };
};
