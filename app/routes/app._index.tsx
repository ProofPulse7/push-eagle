import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export default function AppIndex() {
  return (
    <s-page heading="Push Eagle">
      <s-section heading="Redirecting">
        <s-paragraph>Opening your dashboard…</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
