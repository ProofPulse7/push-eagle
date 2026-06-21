import type { QueryClient } from '@tanstack/react-query';

import { fetchJsonWithShop } from '@/lib/client/api-fetch';
import type { AppBootstrapPayload } from '@/lib/client/hydrate-app-cache';
import type { DashboardSummaryPayload } from '@/lib/client/query-fetchers';
import { queryKeys } from '@/lib/client/query-keys';

/** While below this count, poll the server frequently so new opt-ins appear instantly. */
export const EARLY_SUBSCRIBER_SYNC_MAX = 5;
export const EARLY_SUBSCRIBER_POLL_MS = 2_000;
export const NORMAL_SUBSCRIBER_POLL_MS = 30_000;

export const getSubscriberPollIntervalMs = (count: number) =>
  count < EARLY_SUBSCRIBER_SYNC_MAX ? EARLY_SUBSCRIBER_POLL_MS : NORMAL_SUBSCRIBER_POLL_MS;

export const readCachedSubscriberCount = (queryClient: QueryClient, shop: string): number => {
  const subscribersOverview = queryClient.getQueryData<Record<string, unknown>>(
    queryKeys.subscribersOverview(shop),
  );
  if (subscribersOverview?.totalSubscribers != null) {
    return Number(subscribersOverview.totalSubscribers);
  }
  if (subscribersOverview?.activeSubscribers != null) {
    return Number(subscribersOverview.activeSubscribers);
  }

  const dashboard = queryClient.getQueryData<DashboardSummaryPayload>(queryKeys.dashboardSummary(shop));
  if (dashboard?.subscriberKpis?.totalSubscribers != null) {
    return Number(dashboard.subscriberKpis.totalSubscribers);
  }
  if (dashboard?.overview?.subscriberCount != null) {
    return Number(dashboard.overview.subscriberCount);
  }

  const merchant = queryClient.getQueryData<Record<string, unknown>>(queryKeys.merchantOverview(shop));
  if (merchant?.subscriberCount != null) {
    return Number(merchant.subscriberCount);
  }

  const bootstrap = queryClient.getQueryData<AppBootstrapPayload>(queryKeys.bootstrap(shop));
  if (bootstrap?.subscriberKpis?.totalSubscribers != null) {
    return Number(bootstrap.subscriberKpis.totalSubscribers);
  }
  if (bootstrap?.subscriberOverview?.totalSubscribers != null) {
    return Number(bootstrap.subscriberOverview.totalSubscribers);
  }
  if (bootstrap?.merchantOverview?.subscriberCount != null) {
    return Number(bootstrap.merchantOverview.subscriberCount);
  }

  return 0;
};

export const patchSubscriberCountAcrossApp = (
  queryClient: QueryClient,
  shop: string,
  totalSubscribers: number,
) => {
  queryClient.setQueryData(queryKeys.merchantOverview(shop), (current) => {
    if (!current || typeof current !== 'object') {
      return current;
    }

    return {
      ...(current as Record<string, unknown>),
      subscriberCount: totalSubscribers,
    };
  });

  queryClient.setQueryData(queryKeys.subscribersOverview(shop), (current) => {
    if (!current || typeof current !== 'object') {
      return current;
    }

    return {
      ...(current as Record<string, unknown>),
      totalSubscribers,
      activeSubscribers: totalSubscribers,
    };
  });

  queryClient.setQueryData(queryKeys.dashboardSummary(shop), (current) => {
    if (!current || typeof current !== 'object') {
      return current;
    }

    const summary = current as DashboardSummaryPayload;
    return {
      ...summary,
      overview: {
        ...summary.overview,
        subscriberCount: totalSubscribers,
      },
      subscriberKpis: {
        ...summary.subscriberKpis,
        totalSubscribers,
        activeSubscribers: totalSubscribers,
      },
    };
  });

  queryClient.setQueryData(queryKeys.bootstrap(shop), (current) => {
    if (!current || typeof current !== 'object') {
      return current;
    }

    const bootstrap = current as AppBootstrapPayload;
    return {
      ...bootstrap,
      merchantOverview: {
        ...bootstrap.merchantOverview,
        subscriberCount: totalSubscribers,
      },
      subscriberKpis: {
        ...bootstrap.subscriberKpis,
        totalSubscribers,
        activeSubscribers: totalSubscribers,
      },
      subscriberOverview: bootstrap.subscriberOverview
        ? {
            ...bootstrap.subscriberOverview,
            totalSubscribers,
            activeSubscribers: totalSubscribers,
          }
        : bootstrap.subscriberOverview,
    };
  });
};

export const syncSubscriberCountFromServer = async (
  queryClient: QueryClient,
  shop: string,
): Promise<{ previous: number; next: number; changed: boolean }> => {
  const previous = readCachedSubscriberCount(queryClient, shop);

  try {
    const payload = await fetchJsonWithShop<{ totalSubscribers?: number; activeSubscribers?: number }>(
      '/api/subscribers/count',
      shop,
    );
    const next = Number(payload.totalSubscribers ?? payload.activeSubscribers ?? previous);

    if (next !== previous) {
      patchSubscriberCountAcrossApp(queryClient, shop, next);
    }

    return { previous, next, changed: next !== previous };
  } catch {
    return { previous, next: previous, changed: false };
  }
};
