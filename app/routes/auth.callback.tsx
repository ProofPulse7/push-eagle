import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { handleStandaloneOAuthCallback } from "../lib/standalone-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return handleStandaloneOAuthCallback(request);
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
