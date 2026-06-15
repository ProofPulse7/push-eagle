import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";

import { LoginErrorType } from "@shopify/shopify-app-react-router/server";
import { hasShopifyConfig, missingShopifyConfig } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

const redirectToStandaloneAuth = (request: Request) => {
  const requestUrl = new URL(request.url);
  const shop = requestUrl.searchParams.get("shop");

  if (!shop) {
    return null;
  }

  const authUrl = new URL("/auth", requestUrl.origin);
  authUrl.searchParams.set("shop", shop);

  for (const key of ["return_to", "locale"]) {
    const value = requestUrl.searchParams.get(key);
    if (value) {
      authUrl.searchParams.set(key, value);
    }
  }

  throw redirect(authUrl.toString());
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  redirectToStandaloneAuth(request);

  if (!hasShopifyConfig) {
    return {
      errors: loginErrorMessage({
        form: `Missing Shopify env vars: ${missingShopifyConfig.join(", ")}. Add them in the root Vercel project and redeploy.`,
      }),
    };
  }

  return { errors: loginErrorMessage({}) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!hasShopifyConfig) {
    return {
      errors: loginErrorMessage({
        form: `Missing Shopify env vars: ${missingShopifyConfig.join(", ")}. Add them in the root Vercel project and redeploy.`,
      }),
    };
  }

  const formData = await request.formData();
  const shop = formData.get("shop");
  if (typeof shop === "string" && shop.trim()) {
    const requestUrl = new URL(request.url);
    const authUrl = new URL("/auth", requestUrl.origin);
    authUrl.searchParams.set("shop", shop.trim());
    throw redirect(authUrl.toString());
  }

  return {
    errors: loginErrorMessage({ shop: LoginErrorType.MissingShop }),
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={true}>
      <s-page>
        <Form method="post">
        <s-section heading="Log in">
          {errors.form && <s-banner tone="critical">{errors.form}</s-banner>}
          <s-text-field
            name="shop"
            label="Shop domain"
            details="example.myshopify.com"
            value={shop}
            onChange={(e) => setShop(e.currentTarget.value)}
            autocomplete="on"
            error={errors.shop}
          ></s-text-field>
          <s-button type="submit">Log in</s-button>
        </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
