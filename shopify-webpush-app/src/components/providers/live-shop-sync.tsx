'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { prefetchAppBootstrap, prefetchDashboardSummary } from '@/lib/client/query-fetchers';
import { queryKeys } from '@/lib/client/query-keys';
import { subscribeShopSync } from '@/lib/client/shop-sync-bus';
import { useShopDomain } from '@/hooks/use-shop-domain';

/** Invalidate only queries that currently have mounted observers (avoids Missing queryFn errors). */
const invalidateActiveShopQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  shop: string,
  scopes: Array<'subscribers' | 'dashboard' | 'bootstrap'>,
) => {
  if (scopes.includes('bootstrap')) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bootstrap(shop), refetchType: 'active' });
  }

  if (scopes.includes('dashboard')) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary(shop), refetchType: 'active' });
  }

  if (scopes.includes('subscribers') || scopes.includes('dashboard')) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.subscribersOverview(shop), refetchType: 'active' });
  }
};

/** Keeps dashboard data fresh across tabs. Uses prefetch (with queryFn) instead of blind refetch. */
export function LiveShopSync() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!shop) {
      return;
    }

    void prefetchAppBootstrap(queryClient, shop);
    void prefetchDashboardSummary(queryClient, shop);

    const unsubscribe = subscribeShopSync(shop, (event) => {
      if (event.type === 'all') {
        invalidateActiveShopQueries(queryClient, shop, ['bootstrap', 'dashboard', 'subscribers']);
        return;
      }

      if (event.type === 'subscribers') {
        invalidateActiveShopQueries(queryClient, shop, ['subscribers', 'dashboard']);
        return;
      }

      if (event.type === 'campaigns') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns(shop), refetchType: 'active' });
        return;
      }

      invalidateActiveShopQueries(queryClient, shop, ['dashboard']);
    });

    const poll = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      invalidateActiveShopQueries(queryClient, shop, ['subscribers', 'dashboard']);

      const campaignsPayload = queryClient.getQueryData<{ campaigns?: Array<Record<string, unknown>> }>(
        queryKeys.campaigns(shop),
      );
      const campaigns = Array.isArray(campaignsPayload?.campaigns) ? campaignsPayload.campaigns : [];
      const hasActiveSend = campaigns.some((campaign) => {
        const status = String(campaign.status ?? '').toLowerCase();
        return status === 'sending' || status === 'queued';
      });

      if (hasActiveSend) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns(shop), refetchType: 'active' });
      }
    }, 30_000);

    const onFocus = () => {
      void prefetchAppBootstrap(queryClient, shop);
      void prefetchDashboardSummary(queryClient, shop);
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      void prefetchAppBootstrap(queryClient, shop);
      void prefetchDashboardSummary(queryClient, shop);
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsubscribe();
      window.clearInterval(poll);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [queryClient, shop]);

  return null;
}
