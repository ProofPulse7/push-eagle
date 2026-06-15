import {
  BASIC_PLAN,
  getBusinessTier,
} from '@/lib/server/billing/plans';
import { upsertMerchantBilling } from '@/lib/server/billing/merchant-billing';
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
    // Shopify Billing API rejects $0 subscriptions — activate the free tier locally.
    return {
      test: false,
      confirmationUrl: null,
      subscriptionId: null,
      autoActivated: true,
      planKey: 'basic' as const,
      tierId: null,
      impressionLimit: BASIC_PLAN.impressions,
      priceUsd: BASIC_PLAN.priceUsd,
    };
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
  checkout: Awaited<ReturnType<typeof startPlanSubscriptionCheckout>>,
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
