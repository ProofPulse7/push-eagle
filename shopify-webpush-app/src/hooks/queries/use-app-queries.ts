'use client';

import { useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { fetchJson, fetchJsonWithShop } from '@/lib/client/api-fetch';
import { fetchJsonWithRetry, fetchJsonWithShopRetry } from '@/lib/client/background-save';
import { resolveAnalyticsDateRange } from '@/lib/client/analytics-date-range';
import { readAutomationStatsFromCache } from '@/lib/client/automation-stats-cache';
import {
  deriveCampaignTotalsFromList,
  readAutomationTotalsFromCache,
  readCampaignsFromCache,
  syncMerchantStatsCaches,
  type MerchantDeliveryTotals,
} from '@/lib/client/merchant-combined-stats';
import { readDashboardSummaryFromCache } from '@/lib/client/dashboard-cache';
import { mergeAutomationsFromCache } from '@/lib/client/optimistic-automations';
import { mergeSegmentsFromCache } from '@/lib/client/optimistic-segments';
import { fetchAppBootstrap, fetchCampaignsList, fetchDashboardSummary } from '@/lib/client/query-fetchers';
import { clearPendingSettings } from '@/lib/client/pending-settings';
import { type AppBootstrapPayload } from '@/lib/client/hydrate-app-cache';
import { queryKeys } from '@/lib/client/query-keys';
import { isCampaignActivelySending } from '@/lib/client/campaign-row-metrics';
import { readCachedSubscriberCount } from '@/lib/client/subscriber-count-sync';
import {
  sliceSubscriberGrowthSeries,
  type SubscriberGrowthPayload,
} from '@/lib/client/subscriber-growth-series';
import { useShopDomain } from '@/hooks/use-shop-domain';

export function useAppBootstrap() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.bootstrap(shop),
    queryFn: () => fetchAppBootstrap(queryClient, shop),
    enabled: Boolean(shop),
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous ?? (shop ? queryClient.getQueryData(queryKeys.bootstrap(shop)) : undefined),
  });
}

const SETTINGS_STALE_MS = 30 * 60 * 1000;

export function useMerchantOverview() {
  const shop = useShopDomain();
  return useQuery({
    queryKey: queryKeys.merchantOverview(shop),
    queryFn: () => fetchJsonWithShop<Record<string, unknown>>('/api/settings/overview', shop),
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    refetchOnMount: false,
    placeholderData: (previous) => previous,
  });
}

export function useCampaigns() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.campaigns(shop),
    queryFn: () => fetchCampaignsList(queryClient, shop),
    enabled: Boolean(shop),
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const campaigns = (query.state.data as { campaigns?: Array<Record<string, unknown>> } | undefined)?.campaigns;
      if (!Array.isArray(campaigns)) {
        return false;
      }

      return campaigns.some((campaign) => isCampaignActivelySending(campaign)) ? 15_000 : false;
    },
    refetchIntervalInBackground: false,
    placeholderData: (previous) => previous ?? (shop ? queryClient.getQueryData(queryKeys.campaigns(shop)) : undefined),
  });
}

export function useAutomationsOverview() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.automationsOverview(shop),
    queryFn: async () => {
      const fresh = await fetchJsonWithShop<{
        rules: Array<Record<string, unknown>>;
        totals?: Record<string, unknown>;
      }>('/api/automations/overview', shop);
      return mergeAutomationsFromCache(queryClient, shop, fresh);
    },
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) =>
      previous ?? (shop ? queryClient.getQueryData(queryKeys.automationsOverview(shop)) : undefined),
  });
}

export function useAutomationStats(from?: Date, to?: Date) {
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const isAllTime = !from && !to;
  const { fromIso, toIso } = useMemo(() => {
    if (isAllTime) {
      return { fromIso: 'all', toIso: 'all' };
    }

    const range = resolveAnalyticsDateRange(
      from ? { from, to: to ?? from } : undefined,
    );
    return { fromIso: range.fromIso, toIso: range.toIso };
  }, [from?.getTime(), to?.getTime(), isAllTime]);

  return useQuery({
    queryKey: queryKeys.automationStats(shop, fromIso, toIso),
    queryFn: async () => {
      const params = new URLSearchParams({ shop });
      if (!isAllTime) {
        params.set('from', fromIso);
        params.set('to', toIso);
      }
      const result = await fetchJson<Record<string, unknown>>(`/api/automations/stats?${params.toString()}`);
      queryClient.setQueryData(queryKeys.automationStats(shop, fromIso, toIso), result);
      if (isAllTime) {
        syncMerchantStatsCaches(queryClient, shop);
      }
      return result;
    },
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    refetchOnMount: false,
    initialData: () => readAutomationStatsFromCache(queryClient, shop, fromIso, toIso),
    placeholderData: (previous) =>
      previous ?? readAutomationStatsFromCache(queryClient, shop, fromIso, toIso),
  });
}

export function useSegments() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.segments(shop),
    queryFn: async () => {
      const fresh = await fetchJsonWithShop<{ segments: unknown[] }>('/api/segments', shop);
      return mergeSegmentsFromCache(queryClient, shop, fresh);
    },
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    refetchOnMount: false,
    placeholderData: (previous) => previous,
  });
}

export function useSubscribersOverview() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.subscribersOverview(shop),
    queryFn: () =>
      fetchJsonWithShop<Record<string, unknown>>('/api/subscribers/overview', shop),
    enabled: Boolean(shop),
    staleTime: 15_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchInterval: false,
    initialData: () => {
      const bootstrap = queryClient.getQueryData<AppBootstrapPayload>(queryKeys.bootstrap(shop));
      if (bootstrap?.subscriberOverview) {
        return { ok: true, shopDomain: shop, ...bootstrap.subscriberOverview };
      }
      if (bootstrap?.subscriberKpis) {
        return { ok: true, shopDomain: shop, ...bootstrap.subscriberKpis };
      }
      return undefined;
    },
    placeholderData: (previous) => previous,
  });
}

export function useAttributionSettings() {
  const shop = useShopDomain();
  return useQuery({
    queryKey: queryKeys.attribution(shop),
    queryFn: () =>
      fetchJsonWithShop<Record<string, unknown>>('/api/settings/attribution', shop),
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    refetchOnMount: false,
    placeholderData: (previous) => previous,
  });
}

export function usePrivacySettings() {
  const shop = useShopDomain();
  return useQuery({
    queryKey: queryKeys.privacy(shop),
    queryFn: () =>
      fetchJsonWithShop<Record<string, unknown>>('/api/settings/privacy', shop),
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    refetchOnMount: false,
    placeholderData: (previous) => previous,
  });
}

export function useBrandingSettings() {
  const shop = useShopDomain();
  return useQuery({
    queryKey: queryKeys.branding(shop),
    queryFn: () =>
      fetchJsonWithShop<Record<string, unknown>>('/api/settings/branding', shop),
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    refetchOnMount: false,
    placeholderData: (previous) => previous,
  });
}

export function useCampaignStats(from?: Date, to?: Date) {
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const isAllTime = !from && !to;
  const { fromIso, toIso } = useMemo(() => {
    if (isAllTime) {
      return { fromIso: 'all', toIso: 'all' };
    }

    const range = resolveAnalyticsDateRange(
      from ? { from, to: to ?? from } : undefined,
    );
    return { fromIso: range.fromIso, toIso: range.toIso };
  }, [from?.getTime(), to?.getTime(), isAllTime]);

  return useQuery({
    queryKey: queryKeys.campaignStats(shop, fromIso, toIso),
    queryFn: () => {
      const params = new URLSearchParams({ shop });
      if (!isAllTime) {
        params.set('from', fromIso);
        params.set('to', toIso);
      }
      return fetchJson<Record<string, unknown>>(`/api/campaigns/stats?${params.toString()}`);
    },
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    refetchOnMount: false,
    initialData: () =>
      queryClient.getQueryData<Record<string, unknown>>(queryKeys.campaignStats(shop, fromIso, toIso)),
    placeholderData: (previous) => previous,
  });
}

export function useSubscribersList(sortOrder: 'asc' | 'desc', pageSize = 100) {
  const shop = useShopDomain();

  return useInfiniteQuery({
    queryKey: queryKeys.subscribersList(shop, pageSize, 0, sortOrder),
    queryFn: ({ pageParam }) =>
      fetchJson<Record<string, unknown>>(
        `/api/subscribers/list?shop=${encodeURIComponent(shop)}&limit=${pageSize}&offset=${pageParam}&sort=${sortOrder}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage?.ok || !lastPage.hasMore) {
        return undefined;
      }
      const loaded = allPages.reduce(
        (sum, page) => sum + (Array.isArray(page.subscribers) ? page.subscribers.length : 0),
        0,
      );
      return loaded;
    },
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
  });
}

export function useDashboardSummary() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.dashboardSummary(shop),
    queryFn: () => fetchDashboardSummary(shop),
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previous) =>
      previous ?? readDashboardSummaryFromCache(queryClient, shop),
  });
}

/** All-time delivery stats shared by dashboard, campaigns, and automations pages. */
export function useMerchantCombinedStats() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const { data: campaignsData } = useCampaigns();
  const { data: automationStatsData } = useAutomationStats();
  const { data: dashboardSummary } = useDashboardSummary();

  return useMemo(() => {
    const campaigns = Array.isArray(campaignsData?.campaigns)
      ? (campaignsData.campaigns as Record<string, unknown>[])
      : readCampaignsFromCache(queryClient, shop);

    const campaignTotals = deriveCampaignTotalsFromList(campaigns, shop);
    const automationFromQuery = (automationStatsData?.totals ?? null) as
      | MerchantDeliveryTotals
      | null;
    const automationTotals = automationFromQuery ?? readAutomationTotalsFromCache(queryClient, shop);

    const campaignRevenueCents = campaignTotals.revenueCents;
    const automationRevenueCents = Number(automationTotals.revenueCents ?? 0);
    const billing = (dashboardSummary?.billing ?? {}) as Record<string, unknown>;

    return {
      campaignTotals,
      automationTotals,
      revenueCents: campaignRevenueCents + automationRevenueCents,
      campaignRevenueCents,
      automationRevenueCents,
      deliveryImpressions:
        campaignTotals.impressions + Number(automationTotals.impressions ?? 0),
      campaignsSent: campaignTotals.sentCount,
      scheduledCount: campaignTotals.scheduledCount,
      billing,
      impressionLimit: Number(billing.impressionLimit ?? 0),
      impressionsUsed: Number(billing.impressionsUsed ?? 0),
    };
  }, [
    campaignsData,
    automationStatsData,
    dashboardSummary?.billing,
    queryClient,
    shop,
  ]);
}

export function useThemeEmbedStatus() {
  const shop = useShopDomain();

  return useQuery({
    queryKey: queryKeys.themeEmbedStatus(shop),
    queryFn: () =>
      fetchJsonWithShop<{
        ok: boolean;
        enabled?: boolean;
        checkAvailable?: boolean;
        themeName?: string | null;
        themeEditorUrl?: string | null;
      }>('/api/theme/embed-status', shop),
    enabled: Boolean(shop),
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useOptInSettings() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.optIn(shop),
    queryFn: () => fetchJsonWithShop<Record<string, unknown>>('/api/settings/opt-in', shop),
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    placeholderData: (previous) =>
      previous ??
      (queryClient.getQueryData<Record<string, unknown>>(queryKeys.optIn(shop)) as
        | Record<string, unknown>
        | undefined),
  });
}

export function useAnalyticsStats(from: Date, to: Date, enabled = true) {
  const shop = useShopDomain();
  const { fromIso, toIso } = useMemo(() => {
    const range = resolveAnalyticsDateRange({ from, to });
    return { fromIso: range.fromIso, toIso: range.toIso };
  }, [from.getTime(), to.getTime()]);

  return useQuery({
    queryKey: queryKeys.analyticsStats(shop, fromIso, toIso),
    queryFn: () =>
      fetchJson<Record<string, unknown>>(
        `/api/analytics/stats?shop=${encodeURIComponent(shop)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
      ),
    enabled: Boolean(shop) && enabled,
    staleTime: SETTINGS_STALE_MS,
    refetchOnMount: false,
    placeholderData: (previous) => previous,
  });
}

export function useSubscriberTotalCount() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const { data: overview } = useSubscribersOverview();

  return useMemo(() => {
    if (overview?.totalSubscribers != null) {
      return Number(overview.totalSubscribers);
    }
    if (overview?.activeSubscribers != null) {
      return Number(overview.activeSubscribers);
    }
    return readCachedSubscriberCount(queryClient, shop);
  }, [overview?.totalSubscribers, overview?.activeSubscribers, queryClient, shop]);
}

/** Full daily new-subscriber series — fetched once, sliced client-side for charts. */
export function useSubscriberGrowthSeries() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.subscribersGrowthSeries(shop),
    queryFn: () => fetchJson<SubscriberGrowthPayload>(`/api/subscribers/growth?shop=${encodeURIComponent(shop)}`),
    enabled: Boolean(shop),
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    initialData: () => {
      const bootstrap = queryClient.getQueryData<AppBootstrapPayload>(queryKeys.bootstrap(shop));
      const series = bootstrap?.subscriberGrowthSeries ?? bootstrap?.subscriberGrowth;
      return series as SubscriberGrowthPayload | undefined;
    },
    placeholderData: (previous) => previous,
  });
}

export function useSubscriberGrowth(from?: Date, to?: Date) {
  const { data: series, isLoading, isFetching } = useSubscriberGrowthSeries();

  const payload = useMemo(() => {
    if (!series?.ok) {
      return series;
    }
    if (!from || !to) {
      return series;
    }
    return sliceSubscriberGrowthSeries(series, from, to);
  }, [series, from?.getTime(), to?.getTime()]);

  return {
    data: payload,
    isLoading: isLoading && !series,
    isFetching: isFetching && !series,
  };
}

export function useSaveBrandingSettings() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJsonWithShopRetry<Record<string, unknown>>('/api/settings/branding', shop, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: shop, ...body }),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.branding(shop) });
      const previous = queryClient.getQueryData<Record<string, unknown>>(queryKeys.branding(shop));
      queryClient.setQueryData(queryKeys.branding(shop), {
        ok: true,
        shopDomain: shop,
        ...previous,
        ...body,
      });
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.branding(shop), context.previous);
      }
    },
    onSuccess: () => {
      clearPendingSettings(shop, 'branding');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.branding(shop), refetchType: 'none' });
    },
  });
}

export function useSaveOptInSettings() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJsonWithRetry<Record<string, unknown>>('/api/settings/opt-in', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: shop, ...body }),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.optIn(shop) });
      const previous = queryClient.getQueryData<Record<string, unknown>>(queryKeys.optIn(shop));
      queryClient.setQueryData(queryKeys.optIn(shop), {
        ok: true,
        shopDomain: shop,
        ...previous,
        ...body,
      });
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.optIn(shop), context.previous);
      }
    },
    onSuccess: () => {
      clearPendingSettings(shop, 'optIn');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.optIn(shop), refetchType: 'none' });
    },
  });
}

export function useSaveAttributionSettings() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJsonWithShopRetry<Record<string, unknown>>('/api/settings/attribution', shop, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: shop, ...body }),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.attribution(shop) });
      const previous = queryClient.getQueryData<Record<string, unknown>>(
        queryKeys.attribution(shop),
      );
      queryClient.setQueryData(queryKeys.attribution(shop), {
        ok: true,
        shopDomain: shop,
        ...previous,
        ...body,
      });
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.attribution(shop), context.previous);
      }
    },
    onSuccess: () => {
      clearPendingSettings(shop, 'attribution');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.attribution(shop), refetchType: 'none' });
    },
  });
}

export function useSavePrivacySettings() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJsonWithShopRetry<Record<string, unknown>>('/api/settings/privacy', shop, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: shop, ...body }),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.privacy(shop) });
      const previous = queryClient.getQueryData<Record<string, unknown>>(queryKeys.privacy(shop));
      queryClient.setQueryData(queryKeys.privacy(shop), {
        ok: true,
        shopDomain: shop,
        ...previous,
        ...body,
      });
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.privacy(shop), context.previous);
      }
    },
    onSuccess: () => {
      clearPendingSettings(shop, 'privacy');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.privacy(shop), refetchType: 'none' });
    },
  });
}

export function prefetchShopQueries(queryClient: QueryClient, shop: string) {
  if (!shop) {
    return;
  }

  void queryClient.prefetchQuery({
    queryKey: queryKeys.bootstrap(shop),
    queryFn: () => fetchAppBootstrap(queryClient, shop),
    staleTime: 5 * 60 * 1000,
  });
}

const prefetchIfMissing = async (
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  queryFn: () => Promise<unknown>,
) => {
  const existing = queryClient.getQueryState(queryKey);
  if (existing?.status === 'success' || existing?.fetchStatus === 'fetching') {
    return;
  }

  await queryClient.prefetchQuery({
    queryKey,
    queryFn,
    staleTime: SETTINGS_STALE_MS,
  });
};

/** Background prefetch for main app pages — skips queries already warm in cache. */
export async function prefetchAppPages(queryClient: QueryClient, shop: string) {
  if (!shop) {
    return;
  }

  const { fromIso, toIso } = resolveAnalyticsDateRange();

  const steps: Array<() => Promise<unknown>> = [
    () =>
      prefetchIfMissing(queryClient, queryKeys.bootstrap(shop), () => fetchAppBootstrap(queryClient, shop)),
    () =>
      prefetchIfMissing(queryClient, queryKeys.dashboardSummary(shop), () => fetchDashboardSummary(shop)),
    () =>
      prefetchIfMissing(queryClient, queryKeys.campaigns(shop), () => fetchCampaignsList(queryClient, shop)),
    () =>
      prefetchIfMissing(queryClient, queryKeys.subscribersOverview(shop), () =>
        fetchJsonWithShop<Record<string, unknown>>('/api/subscribers/overview', shop),
      ),
    () =>
      prefetchIfMissing(queryClient, queryKeys.subscribersGrowthSeries(shop), () =>
        fetchJson<SubscriberGrowthPayload>(`/api/subscribers/growth?shop=${encodeURIComponent(shop)}`),
      ),
    () =>
      prefetchIfMissing(queryClient, queryKeys.automationsOverview(shop), async () => {
        const fresh = await fetchJsonWithShop<{
          rules: Array<Record<string, unknown>>;
          totals?: Record<string, unknown>;
        }>('/api/automations/overview', shop);
        return mergeAutomationsFromCache(queryClient, shop, fresh);
      }),
    () =>
      prefetchIfMissing(queryClient, queryKeys.automationStats(shop, 'all', 'all'), async () => {
        const params = new URLSearchParams({ shop });
        return fetchJson<Record<string, unknown>>(`/api/automations/stats?${params.toString()}`);
      }),
    () => {
      const { fromIso, toIso } = resolveAnalyticsDateRange();
      return prefetchIfMissing(queryClient, queryKeys.automationStats(shop, fromIso, toIso), async () => {
        const params = new URLSearchParams({ shop, from: fromIso, to: toIso });
        return fetchJson<Record<string, unknown>>(`/api/automations/stats?${params.toString()}`);
      });
    },
    () =>
      prefetchIfMissing(queryClient, queryKeys.segments(shop), async () => {
        const fresh = await fetchJsonWithShop<{ segments: unknown[] }>('/api/segments', shop);
        return mergeSegmentsFromCache(queryClient, shop, fresh);
      }),
    () =>
      prefetchIfMissing(queryClient, queryKeys.billingStatus(shop), () =>
        fetchJsonWithShop<{ billing?: Record<string, unknown> }>('/api/billing/status?reconcile=0', shop),
      ),
  ];

  for (const step of steps) {
    try {
      await step();
    } catch {
      // Background prefetch should never block the UI.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 80));
  }
}
