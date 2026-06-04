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

const buildDashboardUrl = (baseDashboardUrl: string, shopDomain: string) => {
  const url = new URL("/dashboard", baseDashboardUrl);
  url.searchParams.set("shop", shopDomain);
  return url.toString();
};

const resolveDashboardUrl = () =>
  process.env.SHOPIFY_WEB_DASHBOARD_URL?.trim() ||
  process.env.WEB_DASHBOARD_URL?.trim() ||
  "https://push-eagle-dashboard.vercel.app";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const dashboardUrl = resolveDashboardUrl();

  if (dashboardUrl) {
    const requestUrl = new URL(request.url);
    const headerShop = request.headers.get("x-shopify-shop-domain");

    let auth:
      | {
          session?: { shop?: string; scope?: string | null; accessToken?: string };
          admin?: { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response> };
        }
      | null = null;

    try {
      auth = await authenticate.admin(request);
    } catch {
      auth = null;
    }

    const shopDomain = (
      auth?.session?.shop ||
      requestUrl.searchParams.get("shop") ||
      headerShop ||
      ""
    )
      .trim()
      .toLowerCase();

    if (auth?.session?.shop && auth.admin) {
      try {
        await syncMerchantProfileToDashboard({
          shopDomain: auth.session.shop,
          scope: auth.session.scope || null,
          accessToken: auth.session.accessToken || null,
          admin: auth.admin,
        });
      } catch (error) {
        console.warn("[push-eagle] Merchant profile sync failed before dashboard redirect", {
          shop: auth.session.shop,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      void syncRecentCustomersToDashboard({
        shopDomain: auth.session.shop,
        admin: auth.admin,
      });
    }

    if (shopDomain.endsWith(".myshopify.com")) {
      throw redirect(buildDashboardUrl(dashboardUrl, shopDomain));
    }

    throw redirect(new URL("/dashboard", dashboardUrl).toString());
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

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
