import "@shopify/shopify-app-react-router/adapters/node";
import { createHmac } from "node:crypto";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const readEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
};

export const shopifyApiKey = readEnv(
  "SHOPIFY_API_KEY",
  "SHOPIFY_CLIENT_ID",
  "SHOPIFY_API_CLIENT_ID",
);

const shopifyApiSecret = readEnv(
  "SHOPIFY_API_SECRET",
  "SHOPIFY_API_SECRET_KEY",
  "SHOPIFY_CLIENT_SECRET",
  "SHOPIFY_SECRET",
  "SHOPIFY_APP_SECRET",
);

const deriveAppUrl = () => {
  const explicitUrl = process.env.SHOPIFY_APP_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const nextPublicUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (nextPublicUrl) {
    return nextPublicUrl;
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  }

  return "";
};

const appUrl = deriveAppUrl();

const resolveDashboardUrl = () =>
  readEnv("SHOPIFY_WEB_DASHBOARD_URL", "WEB_DASHBOARD_URL") || "https://push-eagle-dashboard.vercel.app";

const resolveRootAppUrl = () => {
  try {
    return new URL(appUrl).origin;
  } catch {
    return "https://push-eagle.vercel.app";
  }
};

const getProfileSyncSecret = () => readEnv("SHOPIFY_DASHBOARD_SSO_SECRET", "SHOPIFY_API_SECRET");

type AdminShopResponse = {
  data?: {
    shop?: {
      id?: string;
      name?: string;
      email?: string;
      myshopifyDomain?: string;
      currencyCode?: string;
      ianaTimezone?: string;
      primaryDomain?: {
        url?: string;
      };
      plan?: {
        displayName?: string;
      };
      billingAddress?: {
        name?: string;
      };
    };
  };
};

export const syncMerchantProfileToDashboard = async (input: {
  shopDomain: string;
  scope?: string | null;
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
}) => {
  const dashboardUrl = resolveDashboardUrl();
  const secret = getProfileSyncSecret();

  if (!dashboardUrl || !secret) {
    return;
  }

  const response = await input.admin.graphql(`#graphql
    query PushEagleShopProfile {
      shop {
        id
        name
        email
        myshopifyDomain
        currencyCode
        ianaTimezone
        primaryDomain {
          url
        }
        billingAddress {
          name
        }
        plan {
          displayName
        }
      }
    }
  `);

  const json = (await response.json()) as AdminShopResponse;
  const shop = json.data?.shop;
  const ts = Date.now();
  const sig = createHmac("sha256", secret).update(`${input.shopDomain}.${ts}`).digest("hex");

  const syncResponse = await fetch(new URL("/api/integrations/shopify/merchant-profile", dashboardUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Push-Eagle-Signature": sig,
      "X-Push-Eagle-Source": resolveRootAppUrl(),
    },
    body: JSON.stringify({
      shopDomain: input.shopDomain,
      ts,
      shopId: shop?.id ?? null,
      storeName: shop?.name ?? null,
      email: shop?.email ?? null,
      ownerName: shop?.billingAddress?.name ?? null,
      primaryDomain: shop?.primaryDomain?.url ?? null,
      myshopifyDomain: shop?.myshopifyDomain ?? input.shopDomain,
      currencyCode: shop?.currencyCode ?? null,
      timezone: shop?.ianaTimezone ?? null,
      planName: shop?.plan?.displayName ?? null,
      scopes: input.scope ?? null,
    }),
  });

  if (!syncResponse.ok) {
    const body = await syncResponse.text();
    throw new Error(`Merchant profile sync failed: ${syncResponse.status} ${body.slice(0, 200)}`);
  }
};

type AdminCustomersResponse = {
  data?: {
    customers?: {
      nodes?: Array<{
        id?: string;
        email?: string;
        firstName?: string;
        lastName?: string;
      }>;
    };
  };
};

type AdminWebPixelResponse = {
  data?: {
    webPixel?: {
      id?: string;
      settings?: string;
    } | null;
  };
};

type AdminWebPixelCreateResponse = {
  data?: {
    webPixelCreate?: {
      userErrors?: Array<{
        message?: string;
      }>;
      webPixel?: {
        id?: string;
      } | null;
    } | null;
  };
};

type AdminWebPixelUpdateResponse = {
  data?: {
    webPixelUpdate?: {
      userErrors?: Array<{
        message?: string;
      }>;
      webPixel?: {
        id?: string;
      } | null;
    } | null;
  };
};

const resolvePixelEndpointPath = () => readEnv("SHOPIFY_PIXEL_ENDPOINT_PATH") || "/apps/push-eagle/pixel-events";

const buildPixelSettings = () => JSON.stringify({ endpointPath: resolvePixelEndpointPath() });

export const ensureShopifyWebPixel = async (input: {
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
}) => {
  const settings = buildPixelSettings();

  const currentResponse = await input.admin.graphql(`#graphql
    query PushEagleCurrentWebPixel {
      webPixel {
        id
        settings
      }
    }
  `);

  const currentJson = (await currentResponse.json()) as AdminWebPixelResponse;
  const currentPixel = currentJson.data?.webPixel;

  if (!currentPixel?.id) {
    const createResponse = await input.admin.graphql(`#graphql
      mutation PushEagleWebPixelCreate($settings: JSON!) {
        webPixelCreate(webPixel: { settings: $settings }) {
          userErrors {
            message
          }
          webPixel {
            id
          }
        }
      }
    `, {
      variables: {
        settings,
      },
    });

    const createJson = (await createResponse.json()) as AdminWebPixelCreateResponse;
    const userError = createJson.data?.webPixelCreate?.userErrors?.[0]?.message;
    if (userError) {
      throw new Error(`webPixelCreate failed: ${userError}`);
    }

    return;
  }

  if (currentPixel.settings === settings) {
    return;
  }

  const updateResponse = await input.admin.graphql(`#graphql
    mutation PushEagleWebPixelUpdate($id: ID!, $settings: JSON!) {
      webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
        userErrors {
          message
        }
        webPixel {
          id
        }
      }
    }
  `, {
    variables: {
      id: currentPixel.id,
      settings,
    },
  });

  const updateJson = (await updateResponse.json()) as AdminWebPixelUpdateResponse;
  const updateError = updateJson.data?.webPixelUpdate?.userErrors?.[0]?.message;
  if (updateError) {
    throw new Error(`webPixelUpdate failed: ${updateError}`);
  }
};

export const syncRecentCustomersToDashboard = async (input: {
  shopDomain: string;
  admin: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
}) => {
  const dashboardUrl = resolveDashboardUrl();
  const secret = getProfileSyncSecret();

  if (!dashboardUrl || !secret) {
    return;
  }

  const response = await input.admin.graphql(`#graphql
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
  `, {
    variables: { first: 50 },
  });

  const json = (await response.json()) as AdminCustomersResponse;
  const customers = (json.data?.customers?.nodes || []).map((customer) => ({
    customerId: customer.id ?? null,
    email: customer.email ?? null,
    firstName: customer.firstName ?? null,
    lastName: customer.lastName ?? null,
  }));

  if (!customers.length) {
    return;
  }

  const ts = Date.now();
  const sig = createHmac("sha256", secret).update(`${input.shopDomain}.${ts}`).digest("hex");

  const syncResponse = await fetch(new URL("/api/integrations/shopify/customers-sync", dashboardUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Push-Eagle-Signature": sig,
      "X-Push-Eagle-Source": resolveRootAppUrl(),
    },
    body: JSON.stringify({
      shopDomain: input.shopDomain,
      ts,
      customers,
    }),
  });

  if (!syncResponse.ok) {
    const body = await syncResponse.text();
    throw new Error(`Customer sync failed: ${syncResponse.status} ${body.slice(0, 200)}`);
  }
};

export const missingShopifyConfig = [
  !shopifyApiKey ? "SHOPIFY_API_KEY" : null,
  !shopifyApiSecret ? "SHOPIFY_API_SECRET" : null,
  !appUrl ? "SHOPIFY_APP_URL" : null,
].filter(Boolean) as string[];

export const hasShopifyConfig = missingShopifyConfig.length === 0;

export const getShopifyConfigError = () =>
  `Missing Shopify configuration: ${missingShopifyConfig.join(", ")}. Set these in the Vercel project for the root app. Accepted key aliases include SHOPIFY_CLIENT_ID for api key and SHOPIFY_CLIENT_SECRET for api secret.`;

if (!hasShopifyConfig) {
  console.error(getShopifyConfigError());
}

const scopes = (process.env.SCOPES || process.env.SHOPIFY_SCOPES || "")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

let shopifyInstance: ReturnType<typeof shopifyApp> | null = null;

const getShopify = () => {
  if (!hasShopifyConfig) {
    throw new Error(getShopifyConfigError());
  }

  if (!shopifyInstance) {
    shopifyInstance = shopifyApp({
      apiKey: shopifyApiKey,
      apiSecretKey: shopifyApiSecret,
      apiVersion: ApiVersion.October25,
      scopes,
      appUrl,
      authPathPrefix: "/auth",
      sessionStorage: new PrismaSessionStorage(prisma),
      distribution: AppDistribution.AppStore,
      hooks: {
        afterAuth: async ({ session, admin }) => {
          try {
            await ensureShopifyWebPixel({
              admin,
            });
            await syncMerchantProfileToDashboard({
              shopDomain: session.shop,
              scope: session.scope,
              admin,
            });
            void syncRecentCustomersToDashboard({
              shopDomain: session.shop,
              admin,
            });
          } catch (error) {
            console.warn("[push-eagle] Post-auth Shopify setup skipped", {
              shop: session.shop,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      },
      future: {
        expiringOfflineAccessTokens: true,
      },
      ...(process.env.SHOP_CUSTOM_DOMAIN
        ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
        : {}),
    });
  }

  return shopifyInstance;
};

export default getShopify;
export const apiVersion = ApiVersion.October25;

export const addDocumentResponseHeaders = (request: Request, headers: Headers) => {
  if (!hasShopifyConfig) {
    return;
  }

  getShopify().addDocumentResponseHeaders(request, headers);
};

export const authenticate = {
  admin: (request: Request) => getShopify().authenticate.admin(request),
  webhook: (request: Request) => getShopify().authenticate.webhook(request),
};

export const unauthenticated = {
  admin: (request: Request) => getShopify().unauthenticated.admin(request),
};

export const login = (request: Request) => getShopify().login(request);
export const registerWebhooks = (args: Parameters<ReturnType<typeof shopifyApp>["registerWebhooks"]>[0]) =>
  getShopify().registerWebhooks(args);
export const sessionStorage = new PrismaSessionStorage(prisma);
