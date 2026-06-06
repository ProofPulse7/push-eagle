import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import {
  authenticate,
  shopifyApiKey,
  syncMerchantProfileToDashboard,
  syncRecentCustomersToDashboard,
} from "../shopify.server";

const buildDashboardUrl = (baseDashboardUrl: string, shopDomain: string, returnTo?: string | null) => {
  if (returnTo) {
    try {
      const parsed = new URL(returnTo);
      const dashboardOrigin = new URL(baseDashboardUrl).origin;
      if (parsed.origin === dashboardOrigin) {
        parsed.searchParams.set("shop", shopDomain);
        return parsed.toString();
      }
    } catch {
      // Fall back to default dashboard path.
    }
  }

  const url = new URL("/dashboard", baseDashboardUrl);
  url.searchParams.set("shop", shopDomain);
  return url.toString();
};

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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const requestUrl = new URL(request.url);
  const dashboardUrl = resolveDashboardUrl();

  if (dashboardUrl && requestUrl.pathname.startsWith("/app")) {
    // Never catch — authenticate.admin throws OAuth redirects that must propagate.
    const auth = await authenticate.admin(request);
    const returnTo = readReturnTo(request);

    await syncMerchantProfileToDashboard({
      shopDomain: auth.session.shop,
      scope: auth.session.scope || null,
      accessToken: auth.session.accessToken || null,
      admin: auth.admin,
    });

    void syncRecentCustomersToDashboard({
      shopDomain: auth.session.shop,
      admin: auth.admin,
    });

    const target = buildDashboardUrl(dashboardUrl, auth.session.shop, returnTo);
    const response = redirect(target);
    response.headers.append("Set-Cookie", "pe_return_to=; Path=/; Max-Age=0; Secure; SameSite=Lax");
    throw response;
  }

  await authenticate.admin(request);

  return { apiKey: shopifyApiKey };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

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
