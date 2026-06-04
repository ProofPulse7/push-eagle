export type PlanKey = 'basic' | 'business' | 'enterprise';

export type BusinessTier = {
  id: string;
  impressions: number;
  priceUsd: number;
};

export const BASIC_PLAN = {
  key: 'basic' as const,
  name: 'Basic',
  impressions: 10_000,
  priceUsd: 0,
};

export const BUSINESS_TIERS: BusinessTier[] = [
  { id: 'biz-20k', impressions: 20_000, priceUsd: 9 },
  { id: 'biz-30k', impressions: 30_000, priceUsd: 15 },
  { id: 'biz-50k', impressions: 50_000, priceUsd: 20 },
  { id: 'biz-75k', impressions: 75_000, priceUsd: 28 },
  { id: 'biz-100k', impressions: 100_000, priceUsd: 35 },
  { id: 'biz-200k', impressions: 200_000, priceUsd: 65 },
  { id: 'biz-500k', impressions: 500_000, priceUsd: 150 },
  { id: 'biz-1m', impressions: 1_000_000, priceUsd: 280 },
];

export const getBusinessTier = (tierId: string) =>
  BUSINESS_TIERS.find((tier) => tier.id === tierId) ?? null;

export const getBillingPeriodStart = (now = new Date()) => {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
};

export const getBillingPeriodEnd = (periodStart: Date) => {
  return new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1, 0, 0, 0, 0));
};
