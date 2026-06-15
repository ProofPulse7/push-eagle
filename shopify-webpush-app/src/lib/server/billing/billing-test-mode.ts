const adminApiVersion = () =>
  process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || '2025-04';

const SHOPIFY_FETCH_TIMEOUT_MS = 8_000;

/**
 * Resolve whether Shopify billing charges should be created in test mode.
 * Avoids a separate token-validation round trip before appSubscriptionCreate.
 */
export const resolveBillingTestMode = async (shopDomain: string, accessToken: string) => {
  if (process.env.SHOPIFY_BILLING_TEST === 'true') {
    return true;
  }

  if (process.env.SHOPIFY_BILLING_TEST === 'false') {
    return false;
  }

  try {
    const response = await fetch(`https://${shopDomain}/admin/api/${adminApiVersion()}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: 'query { shop { plan { partnerDevelopment } } }',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(SHOPIFY_FETCH_TIMEOUT_MS),
    });

    const payload = (await response.json().catch(() => null)) as {
      data?: { shop?: { plan?: { partnerDevelopment?: boolean } } };
    } | null;

    return Boolean(payload?.data?.shop?.plan?.partnerDevelopment);
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
};
