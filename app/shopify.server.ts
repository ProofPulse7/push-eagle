import "@shopify/shopify-app-react-router/adapters/node";
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
