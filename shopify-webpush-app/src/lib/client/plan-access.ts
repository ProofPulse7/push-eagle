export const isPaidPlanKey = (planKey?: string | null) =>
  planKey === 'business' || planKey === 'enterprise';
