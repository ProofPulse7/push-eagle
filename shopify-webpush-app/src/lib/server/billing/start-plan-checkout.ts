import { BASIC_PLAN } from '@/lib/server/billing/plans';
import { upsertMerchantBilling } from '@/lib/server/billing/merchant-billing';
import { resolveBillingTestMode } from '@/lib/server/billing/billing-test-mode';
import { createRecurringAppSubscription } from '@/lib/server/billing/shopify-admin-billing';
import { ensureShopifyOfflineAccessToken } from '@/lib/server/billing/refresh-shopify-session';
import { buildShopifyReauthorizeUrl } from '@/lib/server/billing/shopify-offline-token-refresh';
import { hasShopifySessionDatabase } from '@/lib/server/billing/shopify-session';

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

  const token = await ensureShopifyOfflineAccessToken(input.shopDomain);
  if (!token) {
    const reauthorizeUrl = buildShopifyReauthorizeUrl(input.shopDomain);
    throw new Error(
      `No valid Shopify offline token. Open Push Eagle from Shopify admin to re-authorize: ${reauthorizeUrl}`,
    );
  }

  const test = await resolveBillingTestMode(input.shopDomain, token);

  const billing = await upsertMerchantBilling({
    shopDomain: input.shopDomain,
    planKey: input.planKey,
    tierId: input.tierId ?? null,
    impressionLimit: input.impressionLimit,
    priceUsd: input.priceUsd,
    status: 'pending',
  });

  const result = await createRecurringAppSubscription({
    shopDomain: input.shopDomain,
    planName: input.planName,
    priceUsd: input.priceUsd,
    returnUrl: input.returnUrl,
    test,
  });

  return {
    billing,
    test,
    confirmationUrl: result.confirmationUrl,
    subscriptionId: result.subscriptionId,
  };
};

export const basicCheckoutPlanName = () =>
  `Push Eagle Basic (${BASIC_PLAN.impressions.toLocaleString()} impressions)`;
