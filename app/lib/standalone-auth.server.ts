import { redirect } from "react-router";

import {
  buildDashboardSsoUrl,
  readReturnTo,
  resolveDashboardUrl,
} from "./dashboard-sso.server";
import {
  getShopifyApi,
  runAfterAuthForSession,
  sessionStorage,
  unauthenticated,
} from "../shopify.server";

const returnToCookie = (returnTo: string) =>
  `pe_return_to=${encodeURIComponent(returnTo)}; Path=/; Max-Age=600; Secure; SameSite=Lax`;

export const sanitizeShopParam = (shop: string | null) => {
  if (!shop) {
    return null;
  }

  return getShopifyApi().utils.sanitizeShop(shop);
};

export const loadOfflineSession = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const offlineId = `offline_${shop}`;
  const session = await sessionStorage.loadSession(offlineId);

  if (!session?.accessToken) {
    return null;
  }

  if (typeof session.isActive === "function" && !session.isActive(undefined)) {
    return null;
  }

  return session;
};

export const beginStandaloneOAuth = async (
  request: Request,
  shop: string,
  returnTo?: string | null,
) => {
  const api = getShopifyApi();
  const sanitizedShop = sanitizeShopParam(shop);

  if (!sanitizedShop) {
    throw redirect("/auth/login");
  }

  const authResponse = await api.auth.begin({
    shop: sanitizedShop,
    callbackPath: "/auth/callback",
    isOnline: false,
    rawRequest: request,
  });

  if (!(authResponse instanceof Response)) {
    throw new Response("Failed to start Shopify OAuth.", { status: 500 });
  }

  if (!returnTo) {
    return authResponse;
  }

  const headers = new Headers(authResponse.headers);
  headers.append("Set-Cookie", returnToCookie(returnTo));
  return new Response(null, {
    status: authResponse.status,
    statusText: authResponse.statusText,
    headers,
  });
};

const readEmbeddedParams = (request: Request) => {
  const requestUrl = new URL(request.url);
  const host = requestUrl.searchParams.get("host");
  const embedded = requestUrl.searchParams.get("embedded");
  return { host, embedded };
};

export const handleStandaloneOAuthCallback = async (request: Request) => {
  const api = getShopifyApi();
  const { session, headers: authHeaders } = await api.auth.callback({
    rawRequest: request,
    expiring: true,
  });

  await sessionStorage.storeSession(session);
  const { admin } = await unauthenticated.admin(session.shop);
  await runAfterAuthForSession(session, admin);

  const returnTo = readReturnTo(request);
  const { host, embedded } = readEmbeddedParams(request);
  const ssoUrl = buildDashboardSsoUrl(session.shop, returnTo, resolveDashboardUrl(), {
    host,
    embedded: embedded || (host ? "1" : null),
  });
  const headers = new Headers(authHeaders ?? undefined);

  throw redirect(ssoUrl, { headers });
};

export const redirectToOAuthOrDashboard = async (request: Request, shop: string) => {
  const sanitizedShop = sanitizeShopParam(shop);
  if (!sanitizedShop) {
    throw redirect("/auth/login");
  }

  const session = await loadOfflineSession(sanitizedShop);
  const returnTo = readReturnTo(request);
  const { host, embedded } = readEmbeddedParams(request);

  if (!session) {
    const authUrl = new URL("/auth", new URL(request.url).origin);
    authUrl.searchParams.set("shop", sanitizedShop);
    if (returnTo) {
      authUrl.searchParams.set("return_to", returnTo);
    }
    if (host) {
      authUrl.searchParams.set("host", host);
    }
    if (host || embedded === "1") {
      authUrl.searchParams.set("embedded", "1");
    }
    throw redirect(authUrl.toString());
  }

  const ssoUrl = buildDashboardSsoUrl(sanitizedShop, returnTo, resolveDashboardUrl(), {
    host,
    embedded: embedded || (host ? "1" : null),
  });
  throw redirect(ssoUrl);
};
