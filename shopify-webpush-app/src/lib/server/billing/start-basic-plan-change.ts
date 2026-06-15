import { BASIC_PLAN } from '@/lib/server/billing/plans';
import {
  isShopifyAuthError,
  refreshBillingAccessTokenAfterAuthFailure,
  resolveBillingAccessTokenFast,
} from '@/lib/server/billing/billing-access-token';
import { getMerchantBillingFast } from '@/lib/server/billing/merchant-billing';
import {
  cancelAppSubscription,
  getActiveAppSubscription,
} from '@/lib/server/billing/shopify-admin-billing';
import { buildShopifyReauthorizeUrl } from '@/lib/server/billing/shopify-offline-token-refresh';
import { hasShopifySessionDatabase } from '@/lib/server/billing/shopify-session';

const PAID_SUBSCRIPTION_EPSILON = 0.001;

/**
 * Moves a merchant to the free Basic plan.
 * Paid Shopify subscriptions are cancelled so Shopify stops billing and records the downgrade.
 * New installs without a paid subscription activate locally (Shopify Billing API does not support $0 charges).
 */
export const startBasicPlanChange = async (shopDomain: string) => {
  if (!hasShopifySessionDatabase()) {
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

  let token = await resolveBillingAccessTokenFast(shopDomain);
  if (!token) {
    const billing = await getMerchantBillingFast(shopDomain);
    if (billing.status === 'active' && billing.planKey === 'basic') {
      return {
        test: false,
        confirmationUrl: null,
        subscriptionId: billing.shopifySubscriptionId,
        autoActivated: true,
        planKey: 'basic' as const,
        tierId: null,
        impressionLimit: BASIC_PLAN.impressions,
        priceUsd: BASIC_PLAN.priceUsd,
      };
    }

    const reauthorizeUrl = buildShopifyReauthorizeUrl(shopDomain);
    throw new Error(
      `No valid Shopify offline token. Open Push Eagle from Shopify admin to re-authorize: ${reauthorizeUrl}`,
    );
  }

  const cancelPaidSubscription = async (accessToken: string) => {
    const active = await getActiveAppSubscription(shopDomain, accessToken);
    if (!active?.id || active.status !== 'ACTIVE') {
      return;
    }

    if (Number(active.amount ?? 0) <= PAID_SUBSCRIPTION_EPSILON) {
      return;
    }

    await cancelAppSubscription(shopDomain, active.id, accessToken);
  };

  try {
    await cancelPaidSubscription(token);
  } catch (error) {
    if (!isShopifyAuthError(error)) {
      throw error;
    }

    token = await refreshBillingAccessTokenAfterAuthFailure(shopDomain);
    if (!token) {
      const reauthorizeUrl = buildShopifyReauthorizeUrl(shopDomain);
      throw new Error(
        `No valid Shopify offline token. Open Push Eagle from Shopify admin to re-authorize: ${reauthorizeUrl}`,
      );
    }

    await cancelPaidSubscription(token);
  }

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
};
