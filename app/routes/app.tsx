import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { redirectToOAuthOrDashboard } from "../lib/standalone-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const requestUrl = new URL(request.url);
  const shop = requestUrl.searchParams.get("shop");

  if (requestUrl.pathname.startsWith("/app")) {
    if (!shop) {
      throw redirect("/auth/login");
    }

    await redirectToOAuthOrDashboard(request, shop);
  }

  if (shop) {
    await redirectToOAuthOrDashboard(request, shop);
  }

  return {};
};

export default function App() {
  return (
    <AppProvider embedded={false}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
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
