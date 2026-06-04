import { createRecurringAppSubscription } from '@/lib/server/billing/shopify-admin-billing';
import { callPushEagleBilling } from '@/lib/server/billing/push-eagle-client';
import { refreshShopifySessionFromRemixApp } from '@/lib/server/billing/refresh-shopify-session';

export const startBusinessSubscriptionCheckout = async (input: {
  shopDomain: string;
  planName: string;
  priceUsd: number;
  returnUrl: string;
  test?: boolean;
}) => {
  try {
    return await createRecurringAppSubscription(input);
  } catch (localError) {
    const localMessage = localError instanceof Error ? localError.message : '';
    const sessionMissing = localMessage.toLowerCase().includes('no shopify session');

    if (!sessionMissing) {
      throw localError;
    }

    await refreshShopifySessionFromRemixApp(input.shopDomain);

    try {
      return await createRecurringAppSubscription(input);
    } catch (retryError) {
      const retryMessage = retryError instanceof Error ? retryError.message : '';
      if (!retryMessage.toLowerCase().includes('no shopify session')) {
        throw retryError;
      }
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
          : 'Could not start Shopify checkout. Re-open Push Eagle from Shopify admin and try again.',
      );
    }

    return {
      confirmationUrl,
      subscriptionId: result.subscriptionId ? String(result.subscriptionId) : null,
      status: typeof result.status === 'string' ? result.status : 'PENDING',
    };
  }
};
