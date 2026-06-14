import type { PlanKey } from '@/lib/server/billing/plans';

export const isPaidPlanKey = (planKey: string | null | undefined) =>
  planKey === 'business' || planKey === 'enterprise';

export const canAccessAnalytics = (planKey: PlanKey | string | null | undefined) =>
  isPaidPlanKey(planKey);
