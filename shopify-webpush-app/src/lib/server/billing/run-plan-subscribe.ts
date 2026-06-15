import {
  BASIC_PLAN,
  getBusinessTier,
} from '@/lib/server/billing/plans';
import { upsertMerchantBilling } from '@/lib/server/billing/merchant-billing';
import { startBasicPlanChange } from '@/lib/server/billing/start-basic-plan-change';
import { startPlanSubscriptionCheckout } from '@/lib/server/billing/start-plan-checkout';
import { buildBillingReturnUrl } from '@/lib/server/billing/build-billing-return-url';

export const runPlanSubscribe = async (input: {
  shopDomain: string;
  planKey: 'basic' | 'business';
  tierId?: string;
  host?: string | null;
  embedded?: string | null;
}) => {
  const returnUrl = buildBillingReturnUrl(input.shopDomain, {
    host: input.host,
    embedded: input.embedded,
  });

  if (input.planKey === 'basic') {
    return startBasicPlanChange(input.shopDomain);
  }

  const tier = getBusinessTier(input.tierId || '');
  if (!tier) {
    throw new Error('Invalid business tier.');
  }

  return startPlanSubscriptionCheckout({
    shopDomain: input.shopDomain,
    planKey: 'business',
    planName: `Push Eagle Business (${tier.impressions.toLocaleString()} impressions)`,
    priceUsd: tier.priceUsd,
    returnUrl,
    impressionLimit: tier.impressions,
    tierId: tier.id,
  });
};

export const activateSubscribedPlan = async (
  shopDomain: string,
  checkout: {
    planKey: 'basic' | 'business';
    tierId?: string | null;
    subscriptionId?: string | null;
    impressionLimit?: number;
    priceUsd?: number;
  },
) => {
  if (checkout.planKey === 'basic') {
    return upsertMerchantBilling({
      shopDomain,
      planKey: 'basic',
      tierId: null,
      impressionLimit: BASIC_PLAN.impressions,
      priceUsd: BASIC_PLAN.priceUsd,
      shopifySubscriptionId: checkout.subscriptionId,
      status: 'active',
    });
  }

  const tier = getBusinessTier(checkout.tierId || '');
  if (!tier) {
    throw new Error('Invalid business tier.');
  }

  return upsertMerchantBilling({
    shopDomain,
    planKey: 'business',
    tierId: tier.id,
    impressionLimit: tier.impressions,
    priceUsd: tier.priceUsd,
    shopifySubscriptionId: checkout.subscriptionId,
    status: 'active',
  });
};
