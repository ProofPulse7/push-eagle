import { BASIC_PLAN } from '@/lib/server/billing/plans';
import {
  isShopifyAuthError,
  refreshBillingAccessTokenAfterAuthFailure,
  resolveBillingAccessTokenFast,
} from '@/lib/server/billing/billing-access-token';
import { markBillingCheckoutPending } from '@/lib/server/billing/merchant-billing';
import { resolveBillingTestMode } from '@/lib/server/billing/billing-test-mode';
import { createRecurringAppSubscription } from '@/lib/server/billing/shopify-admin-billing';
import { buildShopifyReauthorizeUrl } from '@/lib/server/billing/shopify-offline-token-refresh';
import { hasShopifySessionDatabase } from '@/lib/server/billing/shopify-session';

const runSubscriptionCheckout = async (input: {
  shopDomain: string;
  planKey: 'basic' | 'business';
  planName: string;
  priceUsd: number;
  returnUrl: string;
  impressionLimit: number;
  tierId?: string | null;
  accessToken: string;
  test: boolean;
}) => {
  const result = await createRecurringAppSubscription({
    shopDomain: input.shopDomain,
    planName: input.planName,
    priceUsd: input.priceUsd,
    returnUrl: input.returnUrl,
    test: input.test,
    accessToken: input.accessToken,
  });

  void markBillingCheckoutPending({
    shopDomain: input.shopDomain,
    shopifySubscriptionId: result.subscriptionId,
  }).catch(() => {
    // Non-blocking: redirect to Shopify approval must not wait on DB writes.
  });

  return {
    test: input.test,
    confirmationUrl: result.confirmationUrl,
    subscriptionId: result.subscriptionId,
    autoActivated: result.autoActivated ?? false,
    planKey: input.planKey,
    tierId: input.tierId ?? null,
    impressionLimit: input.impressionLimit,
    priceUsd: input.priceUsd,
  };
};

export const startPlanSubscriptionCheckout = async (input: {
  shopDomain: string;
  planKey: 'basic' | 'business';
  planName: string;
  priceUsd: number;
  returnUrl: string;
  impressionLimit: number;
  tierId?: string | null;
}) => {
  if (!hasShopifySessionDatabase()) {
    throw new Error(
      'Billing database is not configured. Set SHOPIFY_SESSION_DATABASE_URL on the dashboard Vercel project.',
    );
  }

  let token = await resolveBillingAccessTokenFast(input.shopDomain);
  if (!token) {
    const reauthorizeUrl = buildShopifyReauthorizeUrl(input.shopDomain);
    throw new Error(
      `No valid Shopify offline token. Open Push Eagle from Shopify admin to re-authorize: ${reauthorizeUrl}`,
    );
  }

  let test = await resolveBillingTestMode(input.shopDomain, token);

  try {
    return await runSubscriptionCheckout({ ...input, accessToken: token, test });
  } catch (error) {
    if (!isShopifyAuthError(error)) {
      throw error;
    }

    token = await refreshBillingAccessTokenAfterAuthFailure(input.shopDomain);
    if (!token) {
      const reauthorizeUrl = buildShopifyReauthorizeUrl(input.shopDomain);
      throw new Error(
        `No valid Shopify offline token. Open Push Eagle from Shopify admin to re-authorize: ${reauthorizeUrl}`,
      );
    }

    test = await resolveBillingTestMode(input.shopDomain, token);

    try {
      return await runSubscriptionCheckout({ ...input, accessToken: token, test });
    } catch (retryError) {
      if (isShopifyAuthError(retryError)) {
        const reauthorizeUrl = buildShopifyReauthorizeUrl(input.shopDomain);
        throw new Error(
          `No valid Shopify offline token. Open Push Eagle from Shopify admin to re-authorize: ${reauthorizeUrl}`,
        );
      }

      throw retryError;
    }
  }
};

export const basicCheckoutPlanName = () =>
  `Push Eagle Basic (${BASIC_PLAN.impressions.toLocaleString()} impressions)`;
