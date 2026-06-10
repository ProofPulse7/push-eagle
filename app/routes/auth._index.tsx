import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { readReturnTo } from "../lib/dashboard-sso.server";
import { beginStandaloneOAuth, sanitizeShopParam } from "../lib/standalone-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = sanitizeShopParam(url.searchParams.get("shop"));

  if (!shop) {
    throw redirect("/auth/login");
  }

  const returnTo = readReturnTo(request);
  return beginStandaloneOAuth(request, shop, returnTo);
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
