'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchJson, fetchJsonWithShop } from '@/lib/client/api-fetch';
import { BASIC_PLAN } from '@/lib/client/billing-plans';
import { queryKeys } from '@/lib/client/query-keys';
import { useShopDomain } from '@/hooks/use-shop-domain';

const patchBillingCache = (
  queryClient: ReturnType<typeof useQueryClient>,
  shop: string,
  billing: Record<string, unknown>,
) => {
  queryClient.setQueryData(queryKeys.billingStatus(shop), {
    ok: true,
    billing,
  });

  queryClient.setQueriesData(
    { queryKey: queryKeys.dashboardSummary(shop) },
    (current: { billing?: Record<string, unknown> } | undefined) =>
      current
        ? {
            ...current,
            billing,
          }
        : current,
  );
};

export function useBillingStatus(options?: { refetchOnMount?: boolean; reconcile?: boolean }) {
  const shop = useShopDomain();
  return useQuery({
    queryKey: queryKeys.billingStatus(shop),
    queryFn: () =>
      fetchJsonWithShop<{ billing: Record<string, unknown> }>(
        `/api/billing/status${options?.reconcile ? '?reconcile=1' : ''}`,
        shop,
      ),
    enabled: Boolean(shop),
    staleTime: 30 * 60 * 1000,
    refetchOnMount: options?.refetchOnMount ? 'always' : false,
    placeholderData: (previous) => previous,
  });
}

export function useSubscribePlan() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: {
      planKey: 'basic' | 'business';
      tierId?: string;
      host?: string;
      embedded?: string;
    }) =>
      fetchJson<{
        ok?: boolean;
        confirmationUrl?: string | null;
        activated?: boolean;
        billing?: Record<string, unknown>;
      }>('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: shop, ...body }),
      }),
    onMutate: async (body) => {
      if (body.planKey !== 'basic' || !shop) {
        return undefined;
      }

      await queryClient.cancelQueries({ queryKey: queryKeys.billingStatus(shop) });
      const previous = queryClient.getQueryData<{ ok?: boolean; billing?: Record<string, unknown> }>(
        queryKeys.billingStatus(shop),
      );
      const currentBilling = previous?.billing ?? {};
      const optimisticBilling = {
        ...currentBilling,
        shopDomain: shop,
        planKey: 'basic',
        tierId: null,
        status: 'active',
        priceUsd: BASIC_PLAN.priceUsd,
        impressionLimit: BASIC_PLAN.impressions,
        shopifySubscriptionId: null,
      };

      patchBillingCache(queryClient, shop, optimisticBilling);
      return { previous };
    },
    onError: (_error, body, context) => {
      if (body.planKey !== 'basic' || !shop || !context?.previous) {
        return;
      }

      queryClient.setQueryData(queryKeys.billingStatus(shop), context.previous);
    },
    onSuccess: (result) => {
      if (result?.billing && typeof result.billing === 'object') {
        patchBillingCache(queryClient, shop, result.billing as Record<string, unknown>);
        return;
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.billingStatus(shop) });
    },
  });
}

export function useConfirmBilling() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchJson<{
        activated?: boolean;
        billing?: Record<string, unknown>;
        message?: string;
      }>('/api/billing/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain: shop }),
      }),
    onSuccess: (result) => {
      if (result?.billing && typeof result.billing === 'object') {
        patchBillingCache(queryClient, shop, result.billing as Record<string, unknown>);
        return;
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.billingStatus(shop) });
    },
  });
}
