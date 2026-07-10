'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { prefetchAppBootstrap } from '@/lib/client/query-fetchers';
import { queryKeys } from '@/lib/client/query-keys';
import {
  EARLY_SUBSCRIBER_SYNC_MAX,
  getSubscriberPollIntervalMs,
  invalidateSubscriberQueries,
  NORMAL_SUBSCRIBER_POLL_MS,
  readCachedSubscriberCount,
  syncSubscriberCountFromServer,
} from '@/lib/client/subscriber-count-sync';
import { syncMerchantStatsCaches } from '@/lib/client/merchant-combined-stats';
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

/**
 * Keeps subscriber counts fresh across tabs.
 * Does NOT re-hit Neon on every focus with dashboardSummary/campaigns —
 * bootstrap KV (30m) already hydrates those for casual browsing.
 */
export function LiveShopSync() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shop) {
      return;
    }

    // Only warm bootstrap if missing — never fan-out 5 Neon APIs on mount/focus.
    const bootstrapState = queryClient.getQueryState(queryKeys.bootstrap(shop));
    if (bootstrapState?.status !== 'success') {
      void prefetchAppBootstrap(queryClient, shop);
    }

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
        syncMerchantStatsCaches(queryClient, shop);
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
        // Count poll is D1-only when audience is d1_only — does not wake Neon.
        const { next } = await refreshSubscriberData(queryClient, shop, {
          fullRefresh: false,
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
            void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns(shop), refetchType: 'active' }).then(() => {
              syncMerchantStatsCaches(queryClient, shop);
            });
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
      // Focus: only refresh D1 subscriber count. Do not wake Neon for browse.
      void refreshSubscriberData(queryClient, shop, { fullRefresh: false });
    };

    window.addEventListener('focus', onFocus);

    return () => {
      unsubscribe();
      if (pollTimerRef.current != null) {
        window.clearTimeout(pollTimerRef.current);
      }
      window.removeEventListener('focus', onFocus);
    };
  }, [shop, queryClient]);

  return null;
}
