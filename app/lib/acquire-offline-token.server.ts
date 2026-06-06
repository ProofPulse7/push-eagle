import { RequestedTokenType } from "@shopify/shopify-api";

import db from "../db.server";
import { getOfflineAccessToken } from "./shopify-billing.server";
import { validateShopifyAccessToken } from "./shopify-offline-token-refresh.server";
import { getShopifyApi, sessionStorage, shopifyApiKey } from "../shopify.server";

const getSessionTokenFromRequest = (request: Request) => {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return new URL(request.url).searchParams.get("id_token");
};

export const buildOAuthInstallUrl = (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const storeHandle = shop.replace(".myshopify.com", "");
  return `https://admin.shopify.com/store/${storeHandle}/oauth/install?client_id=${shopifyApiKey}`;
};

export const purgeOfflineSession = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const offlineId = `offline_${shop}`;
  await db.session.deleteMany({ where: { id: offlineId } }).catch(() => undefined);
};

export const exchangeOfflineAccessToken = async (request: Request, shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const sessionToken = getSessionTokenFromRequest(request);
  if (!sessionToken) {
    return null;
  }

  const api = getShopifyApi();
  await purgeOfflineSession(shop);

  const { session } = await api.auth.tokenExchange({
    shop,
    sessionToken,
    requestedTokenType: RequestedTokenType.OfflineAccessToken,
    expiring: true,
  });

  await sessionStorage.storeSession(session);
  return session.accessToken ?? null;
};

export const ensureOfflineAccessTokenForRequest = async (request: Request, shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();

  let token = await getOfflineAccessToken(shop);
  if (token && (await validateShopifyAccessToken(shop, token))) {
    return token;
  }

  const exchanged = await exchangeOfflineAccessToken(request, shop);
  if (exchanged && (await validateShopifyAccessToken(shop, exchanged))) {
    return exchanged;
  }

  return null;
};
