import { resolveBillingTestMode } from '@/lib/server/billing/billing-test-mode';
import { requireShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';

const CREATE_SUBSCRIPTION = `
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $test: Boolean
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      test: $test
      replacementBehavior: APPLY_IMMEDIATELY
      lineItems: $lineItems
    ) {
      confirmationUrl
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ACTIVE_SUBSCRIPTIONS = `
  query ActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        lineItems {
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
                interval
              }
            }
          }
        }
      }
    }
  }
`;

const adminApiVersion = () =>
  process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || '2025-04';

const adminGraphql = async (shopDomain: string, query: string, variables: Record<string, unknown>) => {
  const accessToken = await requireShopifyOfflineAccessToken(shopDomain);
  const response = await fetch(`https://${shopDomain}/admin/api/${adminApiVersion()}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok) {
    const message = payload.errors?.[0]?.message || `Shopify Admin API error (${response.status}).`;
    throw new Error(message);
  }

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'Shopify GraphQL request failed.');
  }

  return payload.data ?? {};
};

export const createRecurringAppSubscription = async (input: {
  shopDomain: string;
  planName: string;
  priceUsd: number;
  returnUrl: string;
  test?: boolean;
}) => {
  if (input.priceUsd < 0) {
    throw new Error('Plan price cannot be negative.');
  }

  const accessToken = await requireShopifyOfflineAccessToken(input.shopDomain);
  const test =
    input.test === undefined
      ? await resolveBillingTestMode(input.shopDomain, accessToken)
      : Boolean(input.test) || process.env.SHOPIFY_BILLING_TEST === 'true';

  const data = await adminGraphql(input.shopDomain, CREATE_SUBSCRIPTION, {
    name: input.planName,
    returnUrl: input.returnUrl,
    test,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: input.priceUsd, currencyCode: 'USD' },
            interval: 'EVERY_30_DAYS',
          },
        },
      },
    ],
  });

  const result = data.appSubscriptionCreate as
    | {
        confirmationUrl?: string | null;
        appSubscription?: { id?: string; status?: string };
        userErrors?: Array<{ message?: string }>;
      }
    | undefined;

  const userError = result?.userErrors?.[0]?.message;
  if (userError) {
    throw new Error(userError);
  }

  const status = String(result?.appSubscription?.status ?? 'PENDING').toUpperCase();
  const confirmationUrl = result?.confirmationUrl ?? null;

  if (!confirmationUrl && status !== 'ACTIVE') {
    throw new Error('Shopify did not return a confirmation URL.');
  }

  return {
    confirmationUrl,
    subscriptionId: result?.appSubscription?.id ?? null,
    status,
    autoActivated: !confirmationUrl && status === 'ACTIVE',
  };
};

export const getActiveAppSubscription = async (shopDomain: string) => {
  const data = await adminGraphql(shopDomain, ACTIVE_SUBSCRIPTIONS, {});
  const installation = data.currentAppInstallation as
    | {
        activeSubscriptions?: Array<{
          id?: string;
          name?: string;
          status?: string;
          lineItems?: Array<{
            plan?: {
              pricingDetails?: {
                price?: { amount?: string; currencyCode?: string };
              };
            };
          }>;
        }>;
      }
    | undefined;

  const subscriptions = installation?.activeSubscriptions ?? [];
  const active =
    subscriptions.find((item) => String(item.status).toUpperCase() === 'ACTIVE') ?? subscriptions[0];

  if (!active?.id) {
    return null;
  }

  const pricing = active.lineItems?.[0]?.plan?.pricingDetails?.price;
  return {
    id: active.id,
    name: active.name ?? null,
    status: String(active.status ?? '').toUpperCase(),
    amount: Number(pricing?.amount ?? 0),
    currencyCode: pricing?.currencyCode ?? 'USD',
  };
};
