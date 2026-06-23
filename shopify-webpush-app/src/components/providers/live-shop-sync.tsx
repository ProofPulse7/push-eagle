'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { prefetchAppBootstrap, prefetchCampaignsList, prefetchDashboardSummary } from '@/lib/client/query-fetchers';
import { resumePendingCampaignLaunches } from '@/lib/client/campaign-background-launch';
import { queryKeys } from '@/lib/client/query-keys';
import {
  EARLY_SUBSCRIBER_SYNC_MAX,
  getSubscriberPollIntervalMs,
  invalidateSubscriberQueries,
  NORMAL_SUBSCRIBER_POLL_MS,
  readCachedSubscriberCount,
  syncSubscriberCountFromServer,
} from '@/lib/client/subscriber-count-sync';
import { broadcastShopSync, subscribeShopSync } from '@/lib/client/shop-sync-bus';
import { useShopDomain } from '@/hooks/use-shop-domain';

const refreshSubscriberData = async (
  queryClient: ReturnType<typeof useQueryClient>,
  shop: string,
  options?: { fullRefresh?: boolean },
) => {
  const { changed, next } = await syncSubscriberCountFromServer(queryClient, shop);

  if (changed) {
    broadcastShopSync(shop, { type: 'subscribers' });
    invalidateSubscriberQueries(queryClient, shop);
  } else if (options?.fullRefresh) {
    invalidateSubscriberQueries(queryClient, shop);
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
        invalidateSubscriberQueries(queryClient, shop, { includeBootstrap: true });
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

      void queryClient.invalidateQueries({
        queryKey: queryKeys.dashboardSummary(shop),
        refetchType: 'active',
      });
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
      resumePendingCampaignLaunches(queryClient, shop);
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === 'pe' && key[1] === shop && key[2] === 'automations';
        },
        refetchType: 'active',
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onFocus();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      unsubscribe();
      if (pollTimerRef.current != null) {
        window.clearTimeout(pollTimerRef.current);
      }
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [queryClient, shop]);

  return null;
}
