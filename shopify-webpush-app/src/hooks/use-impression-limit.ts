'use client';

import { BASIC_PLAN } from '@/lib/client/billing-plans';
import { useBillingStatus } from '@/hooks/queries/use-billing';

export function useImpressionLimit(options?: { refetchOnMount?: boolean }) {
  const { data, isLoading, isFetching } = useBillingStatus({ ...options, reconcile: true });
  const billing = (data?.billing ?? null) as Record<string, unknown> | null;

  const impressionsUsed = Number(billing?.impressionsUsed ?? 0);
  const impressionLimit = Number(billing?.impressionLimit ?? BASIC_PLAN.impressions);
  const impressionsRemaining = Number(
    billing?.impressionsRemaining ?? Math.max(0, impressionLimit - impressionsUsed),
  );
  const planKey = String(billing?.planKey ?? 'basic');
  const periodEnd = billing?.periodEnd ? new Date(String(billing.periodEnd)) : null;
  const atLimit = impressionsRemaining <= 0;

  return {
    billing,
    planKey,
    impressionsUsed,
    impressionLimit,
    impressionsRemaining,
    periodEnd,
    atLimit,
    isLoading: isLoading && !billing,
    isFetching,
  };
}
