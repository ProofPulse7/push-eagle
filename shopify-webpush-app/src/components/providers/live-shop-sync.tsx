'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { prefetchAppBootstrap, prefetchCampaignsList, prefetchDashboardSummary } from '@/lib/client/query-fetchers';
import { queryKeys } from '@/lib/client/query-keys';
import {
  getSubscriberPollIntervalMs,
  EARLY_SUBSCRIBER_SYNC_MAX,
  NORMAL_SUBSCRIBER_POLL_MS,
  readCachedSubscriberCount,
  syncSubscriberCountFromServer,
} from '@/lib/client/subscriber-count-sync';
import { broadcastShopSync, subscribeShopSync } from '@/lib/client/shop-sync-bus';
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
    void queryClient.invalidateQueries({
      queryKey: ['pe', shop, 'subscribers', 'list'],
      refetchType: 'active',
    });
  }
};

const refreshSubscriberData = async (
  queryClient: ReturnType<typeof useQueryClient>,
  shop: string,
  options?: { fullRefresh?: boolean },
) => {
  const { changed, next } = await syncSubscriberCountFromServer(queryClient, shop);

  if (changed) {
    broadcastShopSync(shop, { type: 'subscribers' });
  }

  if (options?.fullRefresh || (changed && next < EARLY_SUBSCRIBER_SYNC_MAX)) {
    invalidateActiveShopQueries(queryClient, shop, ['subscribers', 'dashboard']);
  }

  return { changed, next };
};

/** Keeps dashboard data fresh across tabs. Uses prefetch (with queryFn) instead of blind refetch. */
export function LiveShopSync() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shop) {
      return;
    }

    void prefetchAppBootstrap(queryClient, shop);
    void prefetchDashboardSummary(queryClient, shop);
    void prefetchCampaignsList(queryClient, shop);

    const unsubscribe = subscribeShopSync(shop, (event) => {
      if (event.type === 'all') {
        invalidateActiveShopQueries(queryClient, shop, ['bootstrap', 'dashboard', 'subscribers']);
        return;
      }

      if (event.type === 'subscribers') {
        void refreshSubscriberData(queryClient, shop, { fullRefresh: true });
        return;
      }

      if (event.type === 'campaigns') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns(shop), refetchType: 'active' });
        return;
      }

      invalidateActiveShopQueries(queryClient, shop, ['dashboard']);
    });

    const runSubscriberPoll = async () => {
      if (!shop) {
        return;
      }

      if (document.visibilityState === 'visible') {
        const cachedCount = readCachedSubscriberCount(queryClient, shop);
        const isEarlyPhase = cachedCount < EARLY_SUBSCRIBER_SYNC_MAX;
        const { next } = await refreshSubscriberData(queryClient, shop, {
          fullRefresh: !isEarlyPhase,
        });

        if (!isEarlyPhase) {
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
        }

        pollTimerRef.current = window.setTimeout(runSubscriberPoll, getSubscriberPollIntervalMs(next));
        return;
      }

      pollTimerRef.current = window.setTimeout(runSubscriberPoll, NORMAL_SUBSCRIBER_POLL_MS);
    };

    pollTimerRef.current = window.setTimeout(
      runSubscriberPoll,
      getSubscriberPollIntervalMs(readCachedSubscriberCount(queryClient, shop)),
    );

    const onFocus = () => {
      void prefetchAppBootstrap(queryClient, shop);
      void prefetchDashboardSummary(queryClient, shop);
      void prefetchCampaignsList(queryClient, shop);
      void refreshSubscriberData(queryClient, shop, { fullRefresh: true });
    };

    window.addEventListener('focus', onFocus);

    return () => {
      unsubscribe();
      if (pollTimerRef.current != null) {
        window.clearTimeout(pollTimerRef.current);
      }
      window.removeEventListener('focus', onFocus);
    };
  }, [queryClient, shop]);

  return null;
}
