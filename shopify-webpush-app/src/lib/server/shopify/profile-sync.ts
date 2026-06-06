import { upsertMerchantProfile, upsertShopifyCustomer } from '@/lib/server/data/store';
import { persistShopifyOfflineToken } from '@/lib/server/billing/persist-shopify-token';

const apiVersion = () => process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || '2025-04';

const shopifyGraphql = async (shopDomain: string, accessToken: string, query: string, variables?: Record<string, unknown>) => {
  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion()}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables: variables || {} }),
    cache: 'no-store',
  });
  return response.json() as Promise<Record<string, unknown>>;
};

export const syncShopifyMerchantAndCustomers = async (input: {
  shopDomain: string;
  accessToken: string;
  scopes?: string | null;
}) => {
  const shopDomain = input.shopDomain.trim().toLowerCase();

  const profileJson = await shopifyGraphql(
    shopDomain,
    input.accessToken,
    `#graphql
      query PushEagleShopProfile {
        shop {
          id
          name
          email
          myshopifyDomain
          currencyCode
          ianaTimezone
          primaryDomain { url }
          billingAddress { name }
          plan { displayName }
        }
      }
    `,
  );

  const shop = (profileJson.data as { shop?: Record<string, unknown> } | undefined)?.shop;

  await upsertMerchantProfile({
    shopDomain,
    shopId: (shop?.id as string | undefined) ?? null,
    storeName: (shop?.name as string | undefined) ?? null,
    email: (shop?.email as string | undefined) ?? null,
    ownerName: ((shop?.billingAddress as { name?: string } | undefined)?.name) ?? null,
    primaryDomain: ((shop?.primaryDomain as { url?: string } | undefined)?.url) ?? null,
    myshopifyDomain: (shop?.myshopifyDomain as string | undefined) ?? shopDomain,
    currencyCode: (shop?.currencyCode as string | undefined) ?? null,
    timezone: (shop?.ianaTimezone as string | undefined) ?? null,
    planName: ((shop?.plan as { displayName?: string } | undefined)?.displayName) ?? null,
    scopes: input.scopes ?? null,
  });

  await persistShopifyOfflineToken({
    shopDomain,
    offlineAccessToken: input.accessToken,
    scopes: input.scopes ?? null,
    source: 'dashboard_shopify_sync',
  });

  const customersJson = await shopifyGraphql(
    shopDomain,
    input.accessToken,
    `#graphql
      query PushEagleRecentCustomers($first: Int!) {
        customers(first: $first, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id
            email
            firstName
            lastName
          }
        }
      }
    `,
    { first: 50 },
  );

  const nodes =
    ((customersJson.data as { customers?: { nodes?: Array<Record<string, unknown>> } } | undefined)?.customers
      ?.nodes) || [];

  for (const customer of nodes) {
    await upsertShopifyCustomer({
      shopDomain,
      customerId: (customer.id as string | undefined) ?? null,
      email: (customer.email as string | undefined) ?? null,
      firstName: (customer.firstName as string | undefined) ?? null,
      lastName: (customer.lastName as string | undefined) ?? null,
    });
  }

  return { shopDomain, synced: true, customers: nodes.length };
};
