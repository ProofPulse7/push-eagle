import type { QueryClient } from '@tanstack/react-query';

import { fetchJsonWithShop } from '@/lib/client/api-fetch';
import { hydrateAppCache, type AppBootstrapPayload } from '@/lib/client/hydrate-app-cache';
import { mergeCampaignsFromCache } from '@/lib/client/optimistic-campaigns';
import { queryKeys } from '@/lib/client/query-keys';

export type DashboardSummaryPayload = {
  overview: Record<string, unknown>;
  campaignStats: Record<string, unknown>;
  subscriberKpis: Record<string, unknown>;
  billing: Record<string, unknown>;
};

export const fetchDashboardSummary = async (shop: string): Promise<DashboardSummaryPayload> => {
  const [overview, campaignStats, subscriberKpis, billingPayload] = await Promise.all([
    fetchJsonWithShop<Record<string, unknown>>('/api/settings/overview', shop),
    fetchJsonWithShop<Record<string, unknown>>('/api/campaigns/stats', shop),
    fetchJsonWithShop<Record<string, unknown>>('/api/subscribers/overview', shop),
    fetchJsonWithShop<{ billing?: Record<string, unknown> }>('/api/billing/status?reconcile=0', shop),
  ]);

  return {
    overview,
    campaignStats,
    subscriberKpis,
    billing: billingPayload.billing ?? {},
  };
};

export const fetchAppBootstrap = async (
  queryClient: QueryClient,
  shop: string,
): Promise<AppBootstrapPayload> => {
  const payload = await fetchJsonWithShop<AppBootstrapPayload>('/api/app/bootstrap', shop);
  hydrateAppCache(queryClient, shop, payload);
  return payload;
};

export const fetchCampaignsList = async (queryClient: QueryClient, shop: string) => {
  const fresh = await fetchJsonWithShop<{ campaigns: unknown[] }>('/api/campaigns', shop);
  return mergeCampaignsFromCache(queryClient, shop, fresh);
};

export const prefetchDashboardSummary = (queryClient: QueryClient, shop: string) =>
  queryClient.prefetchQuery({
    queryKey: queryKeys.dashboardSummary(shop),
    queryFn: () => fetchDashboardSummary(shop),
    staleTime: 30 * 60 * 1000,
  });

export const prefetchAppBootstrap = (queryClient: QueryClient, shop: string) =>
  queryClient.prefetchQuery({
    queryKey: queryKeys.bootstrap(shop),
    queryFn: () => fetchAppBootstrap(queryClient, shop),
    staleTime: 5 * 60 * 1000,
  });

export const prefetchCampaignsList = (queryClient: QueryClient, shop: string) =>
  queryClient.prefetchQuery({
    queryKey: queryKeys.campaigns(shop),
    queryFn: () => fetchCampaignsList(queryClient, shop),
    staleTime: 60_000,
  });
