'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/client/query-keys';
import { subscribeShopSync } from '@/lib/client/shop-sync-bus';
import { useShopDomain } from '@/hooks/use-shop-domain';

const refetchShopQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  shop: string,
  scopes: Array<'campaigns' | 'subscribers' | 'dashboard' | 'bootstrap'>,
) => {
  const tasks: Promise<unknown>[] = [];

  if (scopes.includes('bootstrap') || scopes.includes('dashboard')) {
    tasks.push(queryClient.refetchQueries({ queryKey: queryKeys.bootstrap(shop) }));
    tasks.push(queryClient.refetchQueries({ queryKey: queryKeys.dashboardSummary(shop) }));
  }

  if (scopes.includes('campaigns') || scopes.includes('dashboard')) {
    tasks.push(queryClient.refetchQueries({ queryKey: queryKeys.campaigns(shop) }));
  }

  if (scopes.includes('subscribers') || scopes.includes('dashboard')) {
    tasks.push(queryClient.refetchQueries({ queryKey: queryKeys.subscribersOverview(shop) }));
  }

  void Promise.allSettled(tasks);
};

/** Keeps dashboard data fresh across tabs and after storefront opt-ins / campaign sends. */
export function LiveShopSync() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!shop) {
      return;
    }

    refetchShopQueries(queryClient, shop, ['bootstrap', 'dashboard', 'campaigns', 'subscribers']);

    const unsubscribe = subscribeShopSync(shop, (event) => {
      if (event.type === 'all') {
        refetchShopQueries(queryClient, shop, ['bootstrap', 'dashboard', 'campaigns', 'subscribers']);
        return;
      }

      if (event.type === 'campaigns') {
        refetchShopQueries(queryClient, shop, ['campaigns', 'dashboard']);
        return;
      }

      if (event.type === 'subscribers') {
        refetchShopQueries(queryClient, shop, ['subscribers', 'dashboard']);
        return;
      }

      refetchShopQueries(queryClient, shop, ['dashboard']);
    });

    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      refetchShopQueries(queryClient, shop, ['subscribers', 'dashboard']);

      const campaignsPayload = queryClient.getQueryData<{ campaigns?: Array<Record<string, unknown>> }>(
        queryKeys.campaigns(shop),
      );
      const campaigns = Array.isArray(campaignsPayload?.campaigns) ? campaignsPayload.campaigns : [];
      const hasActiveSend = campaigns.some((campaign) => {
        const status = String(campaign.status ?? '').toLowerCase();
        return status === 'sending' || status === 'queued';
      });

      if (hasActiveSend) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.campaigns(shop),
          refetchType: 'active',
        });
      }
    }, 8000);

    const onFocus = () => {
      refetchShopQueries(queryClient, shop, ['bootstrap', 'dashboard', 'campaigns', 'subscribers']);
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
