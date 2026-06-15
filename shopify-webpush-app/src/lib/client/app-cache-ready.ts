import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/client/query-keys';

/** True when persisted React Query cache already has shop-scoped settings/data. */
export const hasWarmShopCache = (queryClient: QueryClient, shop: string) => {
  if (!shop) {
    return false;
  }

  const cacheKeys = [
    queryKeys.bootstrap(shop),
    queryKeys.dashboardSummary(shop),
    queryKeys.merchantOverview(shop),
    queryKeys.campaigns(shop),
    queryKeys.automationsOverview(shop),
    queryKeys.privacy(shop),
    queryKeys.attribution(shop),
    queryKeys.branding(shop),
    queryKeys.optIn(shop),
    queryKeys.segments(shop),
  ];

  return cacheKeys.some((key) => Boolean(queryClient.getQueryData(key)));
};
