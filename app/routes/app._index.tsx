import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { redirectToOAuthOrDashboard } from "../lib/standalone-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shop = new URL(request.url).searchParams.get("shop");

  if (!shop) {
    throw redirect("/auth/login");
  }

  await redirectToOAuthOrDashboard(request, shop);
};

export default function Index() {
  return (
    <s-page heading="Push Eagle">
      <s-section heading="Redirecting">
        <s-paragraph>Redirecting to your dashboard…</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
