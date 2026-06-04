import { createRecurringAppSubscription } from '@/lib/server/billing/shopify-admin-billing';
import { callPushEagleBilling } from '@/lib/server/billing/push-eagle-client';
import { env } from '@/lib/config/env';

export const startBusinessSubscriptionCheckout = async (input: {
  shopDomain: string;
  planName: string;
  priceUsd: number;
  returnUrl: string;
  test?: boolean;
}) => {
  if (env.SHOPIFY_SESSION_DATABASE_URL.trim()) {
    return createRecurringAppSubscription(input);
  }

  const result = await callPushEagleBilling('/api/shopify/billing/create', input.shopDomain, {
    planName: input.planName,
    priceUsd: input.priceUsd,
    returnUrl: input.returnUrl,
    test: input.test,
  });

  const confirmationUrl = String(result.confirmationUrl || '');
  if (!confirmationUrl) {
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : 'Missing Shopify confirmation URL from billing service.',
    );
  }

  return {
    confirmationUrl,
    subscriptionId: result.subscriptionId ? String(result.subscriptionId) : null,
    status: typeof result.status === 'string' ? result.status : 'PENDING',
  };
};
