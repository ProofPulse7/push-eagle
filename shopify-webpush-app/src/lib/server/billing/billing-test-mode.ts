const adminApiVersion = () =>
  process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || '2025-04';

const SHOPIFY_FETCH_TIMEOUT_MS = 4_000;
const TEST_MODE_CACHE_TTL_MS = 10 * 60 * 1000;
const testModeCache = new Map<string, { value: boolean; expiresAt: number }>();

/**
 * Resolve whether Shopify billing charges should be created in test mode.
 * Skips the dev-store GraphQL round trip in production for faster checkout redirects.
 */
export const resolveBillingTestMode = async (shopDomain: string, accessToken: string) => {
  if (process.env.SHOPIFY_BILLING_TEST === 'true') {
    return true;
  }

  if (process.env.SHOPIFY_BILLING_TEST === 'false') {
    return false;
  }

  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  const cached = testModeCache.get(shopDomain);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
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

    const value = Boolean(payload?.data?.shop?.plan?.partnerDevelopment);
    testModeCache.set(shopDomain, { value, expiresAt: Date.now() + TEST_MODE_CACHE_TTL_MS });
    return value;
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
};
