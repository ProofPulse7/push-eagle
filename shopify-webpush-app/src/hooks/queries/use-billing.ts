'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchJson, fetchJsonWithShop } from '@/lib/client/api-fetch';
import { queryKeys } from '@/lib/client/query-keys';
import { useShopDomain } from '@/hooks/use-shop-domain';

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
    onSuccess: () => {
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.billingStatus(shop) });
    },
  });
}
