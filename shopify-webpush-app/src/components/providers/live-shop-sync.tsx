'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/client/query-keys';
import { subscribeShopSync } from '@/lib/client/shop-sync-bus';
import { useShopDomain } from '@/hooks/use-shop-domain';

const refetchShopQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  shop: string,
  scopes: Array<'subscribers' | 'dashboard' | 'bootstrap'>,
) => {
  const tasks: Promise<unknown>[] = [];

  if (scopes.includes('bootstrap') || scopes.includes('dashboard')) {
    tasks.push(queryClient.refetchQueries({ queryKey: queryKeys.bootstrap(shop) }));
    tasks.push(queryClient.refetchQueries({ queryKey: queryKeys.dashboardSummary(shop) }));
  }

  if (scopes.includes('subscribers') || scopes.includes('dashboard')) {
    tasks.push(queryClient.refetchQueries({ queryKey: queryKeys.subscribersOverview(shop) }));
  }

  void Promise.allSettled(tasks);
};

/** Keeps dashboard data fresh across tabs and after storefront opt-ins. Campaign list polling is handled by useCampaigns(). */
export function LiveShopSync() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!shop) {
      return;
    }

    refetchShopQueries(queryClient, shop, ['bootstrap', 'dashboard', 'subscribers']);

    const unsubscribe = subscribeShopSync(shop, (event) => {
      if (event.type === 'all') {
        refetchShopQueries(queryClient, shop, ['bootstrap', 'dashboard', 'subscribers']);
        return;
      }

      if (event.type === 'subscribers') {
        refetchShopQueries(queryClient, shop, ['subscribers', 'dashboard']);
        return;
      }

      if (event.type === 'campaigns') {
        return;
      }

      refetchShopQueries(queryClient, shop, ['dashboard']);
    });

    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      refetchShopQueries(queryClient, shop, ['subscribers', 'dashboard']);
    }, 30_000);

    const onFocus = () => {
      refetchShopQueries(queryClient, shop, ['bootstrap', 'dashboard', 'subscribers']);
    };

    window.addEventListener('focus', onFocus);

    return () => {
      unsubscribe();
      window.clearInterval(poll);
      window.removeEventListener('focus', onFocus);
    };
  }, [queryClient, shop]);

  return null;
}
