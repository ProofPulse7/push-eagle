import { createHmac } from "node:crypto";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { ExternalRedirect } from "../components/external-redirect";
import { getOfflineAccessToken } from "../lib/shopify-billing.server";
import {
  refreshOfflineAccessToken,
  validateShopifyAccessToken,
} from "../lib/shopify-offline-token-refresh.server";
import {
  authenticate,
  login,
  shopifyApiKey,
  syncMerchantProfileToDashboard,
  syncRecentCustomersToDashboard,
} from "../shopify.server";

const resolveDashboardUrl = () =>
  process.env.SHOPIFY_WEB_DASHBOARD_URL?.trim() ||
  process.env.WEB_DASHBOARD_URL?.trim() ||
  "https://push-eagle-dashboard.vercel.app";

const readReturnTo = (request: Request) => {
  const requestUrl = new URL(request.url);
  const queryReturnTo = requestUrl.searchParams.get("return_to");
  if (queryReturnTo) {
    return queryReturnTo;
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("pe_return_to="));

  if (!entry) {
    return null;
  }

  return decodeURIComponent(entry.slice("pe_return_to=".length));
};

const buildDashboardSsoUrl = (
  baseDashboardUrl: string,
  shopDomain: string,
  returnTo?: string | null,
) => {
  let redirectPath = "/dashboard";

  if (returnTo) {
    try {
      const parsed = new URL(returnTo);
      const dashboardOrigin = new URL(baseDashboardUrl).origin;
      if (parsed.origin === dashboardOrigin) {
        redirectPath = `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // Fall back to /dashboard.
    }
  }

  const ssoUrl = new URL("/api/integrations/shopify/sso", baseDashboardUrl);
  ssoUrl.searchParams.set("shop", shopDomain);
  ssoUrl.searchParams.set("redirect", redirectPath.startsWith("/") ? redirectPath : "/dashboard");

  const secret =
    process.env.SHOPIFY_DASHBOARD_SSO_SECRET?.trim() || process.env.SHOPIFY_API_SECRET?.trim() || "";
  if (secret) {
    const ts = String(Date.now());
    const sig = createHmac("sha256", secret).update(`${shopDomain}.${ts}`).digest("hex");
    ssoUrl.searchParams.set("ts", ts);
    ssoUrl.searchParams.set("sig", sig);
  }

  return ssoUrl.toString();
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const requestUrl = new URL(request.url);
  const dashboardUrl = resolveDashboardUrl();

  if (dashboardUrl && requestUrl.pathname.startsWith("/app")) {
    const auth = await authenticate.admin(request);
    const returnTo = readReturnTo(request);
    const redirectUrl = buildDashboardSsoUrl(dashboardUrl, auth.session.shop, returnTo);
    let tokenForSync =
      !auth.session.isOnline && auth.session.accessToken
        ? auth.session.accessToken
        : await getOfflineAccessToken(auth.session.shop);

    const refreshedOffline = await refreshOfflineAccessToken(auth.session.shop);
    if (refreshedOffline) {
      tokenForSync = refreshedOffline;
    }

    const hasValidOfflineToken =
      Boolean(tokenForSync) &&
      (await validateShopifyAccessToken(auth.session.shop, tokenForSync as string));

    if (!hasValidOfflineToken) {
      throw await login(request);
    }

    try {
      await syncMerchantProfileToDashboard({
        shopDomain: auth.session.shop,
        scope: auth.session.scope || null,
        accessToken: tokenForSync,
        admin: auth.admin,
      });
    } catch (error) {
      console.warn("[push-eagle] Profile sync before dashboard redirect failed", {
        shop: auth.session.shop,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    void syncRecentCustomersToDashboard({
      shopDomain: auth.session.shop,
      admin: auth.admin,
    }).catch(() => {
      // Non-blocking.
    });

    return { apiKey: shopifyApiKey, redirectUrl };
  }

  await authenticate.admin(request);

  return { apiKey: shopifyApiKey, redirectUrl: null };
};

export default function App() {
  const { apiKey, redirectUrl } = useLoaderData<typeof loader>();

  if (redirectUrl) {
    return <ExternalRedirect url={redirectUrl} />;
  }

  return (
    <AppProvider embedded={false} apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/additional">Additional page</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
