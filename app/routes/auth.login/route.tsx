import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { hasShopifyConfig, login, missingShopifyConfig } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (!hasShopifyConfig) {
    return {
      errors: loginErrorMessage({
        form: `Missing Shopify env vars: ${missingShopifyConfig.join(", ")}. Add them in the root Vercel project and redeploy.`,
      }),
    };
  }

  const errors = loginErrorMessage(await login(request));

  return { errors };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!hasShopifyConfig) {
    return {
      errors: loginErrorMessage({
        form: `Missing Shopify env vars: ${missingShopifyConfig.join(", ")}. Add them in the root Vercel project and redeploy.`,
      }),
    };
  }

  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <AppProvider embedded={false}>
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
