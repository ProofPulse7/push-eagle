import type { QueryClient } from '@tanstack/react-query';

import { fetchJsonWithShop } from '@/lib/client/api-fetch';
import { hydrateAppCache, type AppBootstrapPayload } from '@/lib/client/hydrate-app-cache';
import { mergeCampaignsFromCache, clearShopCampaignBrowserCache } from '@/lib/client/optimistic-campaigns';
import { queryKeys } from '@/lib/client/query-keys';

export type DashboardSummaryPayload = {
  overview: Record<string, unknown>;
  campaignStats: Record<string, unknown>;
  subscriberKpis: Record<string, unknown>;
  billing: Record<string, unknown>;
  automationTotals?: Record<string, unknown>;
};

export const fetchDashboardSummary = async (shop: string): Promise<DashboardSummaryPayload> => {
  // Never use reconcile=1 for browse/prefetch — that recounts all impressions and wakes Neon+D1.
  const [overview, campaignStats, subscriberKpis, billingPayload, automationOverview] = await Promise.all([
    fetchJsonWithShop<Record<string, unknown>>('/api/settings/overview', shop),
    fetchJsonWithShop<Record<string, unknown>>('/api/campaigns/stats', shop),
    fetchJsonWithShop<Record<string, unknown>>('/api/subscribers/overview', shop),
    fetchJsonWithShop<{ billing?: Record<string, unknown> }>('/api/billing/status?reconcile=0', shop),
    fetchJsonWithShop<{ totals?: Record<string, unknown> }>('/api/automations/overview', shop),
  ]);

  return {
    overview,
    campaignStats,
    subscriberKpis,
    billing: billingPayload.billing ?? {},
    automationTotals: automationOverview.totals ?? {},
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
  const merged = mergeCampaignsFromCache(queryClient, shop, fresh);
  if (Array.isArray(fresh.campaigns) && fresh.campaigns.length === 0 && merged.campaigns?.length === 0) {
    clearShopCampaignBrowserCache(shop);
  }
  return merged;
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
    staleTime: 30 * 60 * 1000,
  });

export const prefetchCampaignsList = (queryClient: QueryClient, shop: string) =>
  queryClient.prefetchQuery({
    queryKey: queryKeys.campaigns(shop),
    queryFn: () => fetchCampaignsList(queryClient, shop),
    staleTime: 10 * 60 * 1000,
  });
