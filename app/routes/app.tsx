import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { createHmac } from "node:crypto";
import { redirect, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate, shopifyApiKey } from "../shopify.server";

const buildDashboardSsoUrl = (baseDashboardUrl: string, shopDomain: string) => {
  const secret = process.env.SHOPIFY_DASHBOARD_SSO_SECRET?.trim() || process.env.SHOPIFY_API_SECRET?.trim();
  const url = new URL("/api/integrations/shopify/sso", baseDashboardUrl);

  if (!secret) {
    url.searchParams.set("shop", shopDomain);
    url.searchParams.set("redirect", "/dashboard");
    return url.toString();
  }

  const ts = String(Date.now());
  const payload = `${shopDomain}.${ts}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");

  url.searchParams.set("shop", shopDomain);
  url.searchParams.set("ts", ts);
  url.searchParams.set("sig", sig);
  url.searchParams.set("redirect", "/dashboard");

  return url.toString();
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await authenticate.admin(request);
  const dashboardUrl =
    process.env.SHOPIFY_WEB_DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.WEB_DASHBOARD_URL ||
    "";

  if (dashboardUrl && auth.session?.shop) {
    throw redirect(buildDashboardSsoUrl(dashboardUrl, auth.session.shop));
  }

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

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
