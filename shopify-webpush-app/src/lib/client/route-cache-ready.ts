import type { QueryClient } from '@tanstack/react-query';

import { hasWarmShopCache } from '@/lib/client/app-cache-ready';
import { readShopDomainSync } from '@/lib/client/read-shop-domain';
import { queryKeys } from '@/lib/client/query-keys';

/** True when React Query already has data for the destination route. */
export const hasRouteWarmCache = (
  queryClient: QueryClient,
  shop: string,
  pathname: string,
) => {
  const resolvedShop = (shop || readShopDomainSync()).trim().toLowerCase();
  if (!resolvedShop) {
    return false;
  }

  if (pathname === '/dashboard' || pathname === '/') {
    return Boolean(queryClient.getQueryData(queryKeys.dashboardSummary(resolvedShop)));
  }

  if (pathname.startsWith('/campaigns') && !pathname.startsWith('/campaigns/new')) {
    return Boolean(queryClient.getQueryData(queryKeys.campaigns(resolvedShop)));
  }

  if (pathname.startsWith('/automations') && pathname === '/automations') {
    return Boolean(queryClient.getQueryData(queryKeys.automationsOverview(resolvedShop)));
  }

  if (pathname.startsWith('/subscribers')) {
    return Boolean(queryClient.getQueryData(queryKeys.subscribersOverview(resolvedShop)));
  }

  if (pathname.startsWith('/settings')) {
    return Boolean(
      queryClient.getQueryData(queryKeys.merchantOverview(resolvedShop))
      || queryClient.getQueryData(queryKeys.branding(resolvedShop)),
    );
  }

  if (pathname.startsWith('/segments')) {
    return Boolean(queryClient.getQueryData(queryKeys.segments(resolvedShop)));
  }

  if (pathname.startsWith('/plans')) {
    return Boolean(queryClient.getQueryData(queryKeys.billingStatus(resolvedShop)));
  }

  if (pathname.startsWith('/opt-ins')) {
    return Boolean(queryClient.getQueryData(queryKeys.optIn(resolvedShop)));
  }

  return hasWarmShopCache(queryClient, resolvedShop);
};
