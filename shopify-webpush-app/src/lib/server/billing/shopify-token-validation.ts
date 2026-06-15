const adminApiVersion = () =>
  process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || '2025-04';

const SHOPIFY_FETCH_TIMEOUT_MS = 8_000;

export const validateShopifyAccessToken = async (shopDomain: string, accessToken: string) => {
  try {
    const response = await fetch(`https://${shopDomain}/admin/api/${adminApiVersion()}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: 'query { shop { name myshopifyDomain } }',
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(SHOPIFY_FETCH_TIMEOUT_MS),
    });

    const payload = (await response.json().catch(() => null)) as {
      data?: { shop?: { name?: string } };
      errors?: Array<{ message?: string }>;
    } | null;

    return (
      response.ok &&
      Boolean(payload?.data?.shop?.name) &&
      !payload?.errors?.length
    );
  } catch {
    return false;
  }
};
