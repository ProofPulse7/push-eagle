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
import { resolveAnalyticsDateRange } from '@/lib/client/analytics-date-range';
import { clearPendingSettings } from '@/lib/client/pending-settings';
import {
  hydrateAppCache,
  type AppBootstrapPayload,
} from '@/lib/client/hydrate-app-cache';
import { queryKeys } from '@/lib/client/query-keys';
import { useShopDomain } from '@/hooks/use-shop-domain';

export function useAppBootstrap() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: queryKeys.bootstrap(shop),
    queryFn: async () => {
      const payload = await fetchJsonWithShop<AppBootstrapPayload>('/api/app/bootstrap', shop);
      hydrateAppCache(queryClient, shop, payload);
      return payload;
    },
    enabled: Boolean(shop),
    staleTime: 30 * 60 * 1000,
    refetchOnMount: false,
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
    placeholderData: (previous) => previous,
  });
}

export function useCampaigns() {
  const shop = useShopDomain();
  return useQuery({
    queryKey: queryKeys.campaigns(shop),
    queryFn: () =>
      fetchJsonWithShop<{ campaigns: unknown[] }>('/api/campaigns', shop),
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    placeholderData: (previous) => previous,
  });
}

export function useAutomationsOverview() {
  const shop = useShopDomain();
  return useQuery({
    queryKey: queryKeys.automationsOverview(shop),
    queryFn: () =>
      fetchJsonWithShop<{ rules: Array<Record<string, unknown>> }>(
        '/api/automations/overview',
        shop,
      ),
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    placeholderData: (previous) => previous,
  });
}

export function useSegments() {
  const shop = useShopDomain();
  return useQuery({
    queryKey: queryKeys.segments(shop),
    queryFn: () =>
      fetchJsonWithShop<{ segments: unknown[] }>('/api/segments', shop),
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    placeholderData: (previous) => previous,
  });
}

export function useSubscribersOverview() {
  const shop = useShopDomain();
  return useQuery({
    queryKey: queryKeys.subscribersOverview(shop),
    queryFn: () =>
      fetchJsonWithShop<Record<string, unknown>>('/api/subscribers/overview', shop),
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
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
    placeholderData: (previous) => previous,
  });
}

export function useCampaignStats(from?: Date, to?: Date) {
  const shop = useShopDomain();
  const { fromIso, toIso } = useMemo(() => {
    const range = resolveAnalyticsDateRange(
      from && to ? { from, to } : undefined,
    );
    return { fromIso: range.fromIso, toIso: range.toIso };
  }, [from?.getTime(), to?.getTime()]);

  return useQuery({
    queryKey: queryKeys.campaignStats(shop, fromIso, toIso),
    queryFn: () => {
      const params = new URLSearchParams({ shop });
      params.set('from', fromIso);
      params.set('to', toIso);
      return fetchJson<Record<string, unknown>>(`/api/campaigns/stats?${params.toString()}`);
    },
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
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
  const range = useMemo(() => resolveAnalyticsDateRange(), []);
  const overview = useMerchantOverview();
  const campaignStats = useCampaignStats(range.from, range.to);
  const subscriberKpis = useSubscribersOverview();

  const data =
    overview.data && campaignStats.data && subscriberKpis.data
      ? {
          overview: overview.data,
          campaignStats: campaignStats.data,
          subscriberKpis: subscriberKpis.data,
        }
      : undefined;

  return {
    data,
    isLoading: overview.isLoading || campaignStats.isLoading || subscriberKpis.isLoading,
    isFetching: overview.isFetching || campaignStats.isFetching || subscriberKpis.isFetching,
    isError: overview.isError || campaignStats.isError || subscriberKpis.isError,
    error: overview.error ?? campaignStats.error ?? subscriberKpis.error,
  };
}

export function useAnalyticsStats(from: Date, to: Date) {
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
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    placeholderData: (previous) => previous,
  });
}

export function useSubscriberGrowth(from: Date, to: Date) {
  const shop = useShopDomain();
  const { fromIso, toIso } = useMemo(() => {
    const range = resolveAnalyticsDateRange({ from, to });
    return { fromIso: range.fromIso, toIso: range.toIso };
  }, [from.getTime(), to.getTime()]);

  return useQuery({
    queryKey: queryKeys.subscribersGrowth(shop, fromIso, toIso),
    queryFn: () =>
      fetchJson<Record<string, unknown>>(
        `/api/subscribers/growth?shop=${encodeURIComponent(shop)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
      ),
    enabled: Boolean(shop),
    staleTime: SETTINGS_STALE_MS,
    placeholderData: (previous) => previous,
  });
}

export function useSaveBrandingSettings() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<Record<string, unknown>>('/api/settings/branding', {
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.branding(shop) });
    },
  });
}

export function useSaveAttributionSettings() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<Record<string, unknown>>('/api/settings/attribution', {
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.attribution(shop) });
    },
  });
}

export function useSavePrivacySettings() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<Record<string, unknown>>('/api/settings/privacy', {
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.privacy(shop) });
    },
  });
}

export function prefetchShopQueries(queryClient: QueryClient, shop: string) {
  if (!shop) {
    return;
  }

  void queryClient.prefetchQuery({
    queryKey: queryKeys.bootstrap(shop),
    queryFn: async () => {
      const payload = await fetchJsonWithShop<AppBootstrapPayload>('/api/app/bootstrap', shop);
      hydrateAppCache(queryClient, shop, payload);
      return payload;
    },
    staleTime: 5 * 60 * 1000,
  });
}
