import { BASIC_PLAN, BUSINESS_TIERS } from '@/lib/server/billing/plans';
import {
  clearBillingCheckoutPending,
  getMerchantBillingFast,
  upsertMerchantBilling,
  type MerchantBillingRecord,
} from '@/lib/server/billing/merchant-billing';
import { getActiveAppSubscription } from '@/lib/server/billing/shopify-admin-billing';
import { hasShopifySessionDatabase } from '@/lib/server/billing/shopify-session';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const matchTierByPrice = (amount: number) => {
  const sorted = [...BUSINESS_TIERS].sort((a, b) => b.priceUsd - a.priceUsd);
  return sorted.find((tier) => Math.abs(tier.priceUsd - amount) < 0.01) ?? BUSINESS_TIERS[0];
};

export const applyActiveSubscriptionToBilling = async (
  shopDomain: string,
  active: { id?: string; status?: string; amount?: number },
): Promise<MerchantBillingRecord> => {
  const amount = Number(active.amount ?? 0);

  if (amount <= 0.001) {
    return upsertMerchantBilling({
      shopDomain,
      planKey: 'basic',
      tierId: null,
      impressionLimit: BASIC_PLAN.impressions,
      priceUsd: BASIC_PLAN.priceUsd,
      shopifySubscriptionId: active.id ? String(active.id) : null,
      status: 'active',
    });
  }

  const tier = matchTierByPrice(amount);
  return upsertMerchantBilling({
    shopDomain,
    planKey: 'business',
    tierId: tier.id,
    impressionLimit: tier.impressions,
    priceUsd: tier.priceUsd,
    shopifySubscriptionId: active.id ? String(active.id) : null,
    status: 'active',
  });
};

export const syncBillingFromShopifyActiveSubscription = async (shopDomain: string) => {
  if (!hasShopifySessionDatabase()) {
    return { active: null as null, billing: await getMerchantBillingFast(shopDomain) };
  }

  const active = await getActiveAppSubscription(shopDomain);
  if (active?.id && active.status === 'ACTIVE') {
    const billing = await applyActiveSubscriptionToBilling(shopDomain, active);
    return { active, billing };
  }

  return { active: null, billing: await getMerchantBillingFast(shopDomain) };
};

export const confirmBillingFromShopify = async (
  shopDomain: string,
  options?: { maxAttempts?: number; retryDelayMs?: number },
) => {
  const maxAttempts = options?.maxAttempts ?? 6;
  const retryDelayMs = options?.retryDelayMs ?? 1200;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { active, billing } = await syncBillingFromShopifyActiveSubscription(shopDomain);
    if (active?.id && active.status === 'ACTIVE') {
      return {
        ok: true as const,
        activated: true,
        billing,
      };
    }

    if (attempt < maxAttempts - 1) {
      await sleep(retryDelayMs);
    }
  }

  await clearBillingCheckoutPending(shopDomain);
  const billing = await getMerchantBillingFast(shopDomain);

  return {
    ok: true as const,
    activated: false,
    billing,
    message:
      billing.status === 'pending'
        ? 'Subscription not active yet. Approve the charge in Shopify if you have not already.'
        : 'Your current plan is unchanged.',
  };
};

export const handleDeclinedAppSubscription = async (shopDomain: string) => {
  const { active, billing } = await syncBillingFromShopifyActiveSubscription(shopDomain);

  if (active?.id && active.status === 'ACTIVE') {
    return billing;
  }

  await clearBillingCheckoutPending(shopDomain);
  return getMerchantBillingFast(shopDomain);
};
