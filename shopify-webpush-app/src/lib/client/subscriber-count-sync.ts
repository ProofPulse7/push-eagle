import type { QueryClient } from '@tanstack/react-query';

import { fetchJsonWithShop } from '@/lib/client/api-fetch';
import { EARLY_SUBSCRIBER_SYNC_MAX } from '@/lib/constants/subscriber-sync';
import type { AppBootstrapPayload } from '@/lib/client/hydrate-app-cache';
import type { DashboardSummaryPayload } from '@/lib/client/query-fetchers';
import { queryKeys } from '@/lib/client/query-keys';

/** While below this count, poll the server frequently so new opt-ins appear instantly. */
export { EARLY_SUBSCRIBER_SYNC_MAX } from '@/lib/constants/subscriber-sync';
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

const applySubscriberKpiPatch = (
  kpis: Record<string, unknown>,
  totalSubscribers: number,
  incrementNewLast7Days?: number,
) => ({
  ...kpis,
  totalSubscribers,
  activeSubscribers: totalSubscribers,
  ...(incrementNewLast7Days && incrementNewLast7Days > 0
    ? {
        newSubscribersLast7Days:
          Number(kpis.newSubscribersLast7Days ?? 0) + incrementNewLast7Days,
      }
    : {}),
});

export const bumpSubscriberGrowthCharts = (
  queryClient: QueryClient,
  shop: string,
  delta: number,
) => {
  if (delta <= 0) {
    return;
  }

  const todayKey = new Date().toISOString().slice(0, 10);

  const patchSeries = (current: unknown) => {
    if (!current || typeof current !== 'object') {
      return current;
    }

    const payload = current as Record<string, unknown>;
    if (!payload.ok || !Array.isArray(payload.points)) {
      return current;
    }

    const points = (payload.points as Array<{ date?: string; subscribers?: number }>).map((point) => ({
      date: String(point.date ?? ''),
      subscribers: Number(point.subscribers ?? 0),
    }));

    const todayIndex = points.findIndex((point) => point.date.startsWith(todayKey));
    if (todayIndex >= 0) {
      points[todayIndex] = {
        ...points[todayIndex],
        subscribers: points[todayIndex].subscribers + delta,
      };
    } else {
      points.push({ date: todayKey, subscribers: delta });
    }

    return {
      ...payload,
      points,
      totalNewSubscribers: Number(payload.totalNewSubscribers ?? 0) + delta,
    };
  };

  queryClient.setQueryData(queryKeys.subscribersGrowthSeries(shop), patchSeries);
};

/** Refetch subscriber stats, graphs, and lists that are currently mounted. */
export const invalidateSubscriberQueries = (
  queryClient: QueryClient,
  shop: string,
  options?: { includeBootstrap?: boolean },
) => {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.subscribersOverview(shop),
    refetchType: 'active',
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.subscribersGrowthSeries(shop),
    refetchType: 'active',
  });
  void queryClient.invalidateQueries({
    queryKey: ['pe', shop, 'subscribers', 'list'],
    refetchType: 'active',
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.dashboardSummary(shop),
    refetchType: 'active',
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.merchantOverview(shop),
    refetchType: 'active',
  });

  if (options?.includeBootstrap) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.bootstrap(shop),
      refetchType: 'active',
    });
  }
};

export const patchSubscriberCountAcrossApp = (
  queryClient: QueryClient,
  shop: string,
  totalSubscribers: number,
  options?: { incrementNewLast7Days?: number },
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

    return applySubscriberKpiPatch(
      current as Record<string, unknown>,
      totalSubscribers,
      options?.incrementNewLast7Days,
    );
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
      subscriberKpis: applySubscriberKpiPatch(
        summary.subscriberKpis,
        totalSubscribers,
        options?.incrementNewLast7Days,
      ),
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
      subscriberKpis: applySubscriberKpiPatch(
        bootstrap.subscriberKpis,
        totalSubscribers,
        options?.incrementNewLast7Days,
      ),
      subscriberOverview: bootstrap.subscriberOverview
        ? applySubscriberKpiPatch(
            bootstrap.subscriberOverview,
            totalSubscribers,
            options?.incrementNewLast7Days,
          )
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
      const delta = Math.max(0, next - previous);
      patchSubscriberCountAcrossApp(queryClient, shop, next, {
        incrementNewLast7Days: delta > 0 ? delta : undefined,
      });
      if (delta > 0) {
        bumpSubscriberGrowthCharts(queryClient, shop, delta);
      }
    }

    return { previous, next, changed: next !== previous };
  } catch {
    return { previous, next: previous, changed: false };
  }
};
