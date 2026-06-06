import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useActionData, useLoaderData } from "react-router";

import { hasShopifyConfig, login, missingShopifyConfig } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

const persistReturnToCookie = (request: Request, response: Response) => {
  const returnTo = new URL(request.url).searchParams.get("return_to");
  if (!returnTo) {
    return response;
  }

  response.headers.append(
    "Set-Cookie",
    `pe_return_to=${encodeURIComponent(returnTo)}; Path=/; Max-Age=600; Secure; SameSite=Lax`,
  );
  return response;
};

const runLogin = async (request: Request) => {
  try {
    const errors = loginErrorMessage(await login(request));
    return { errors };
  } catch (error) {
    if (error instanceof Response) {
      throw persistReturnToCookie(request, error);
    }
    throw error;
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop && hasShopifyConfig) {
    const appUrl = new URL("/app", url.origin);
    url.searchParams.forEach((value, key) => {
      appUrl.searchParams.set(key, value);
    });
    throw redirect(appUrl.toString());
  }

  if (!hasShopifyConfig) {
    return {
      errors: loginErrorMessage({
        form: `Missing Shopify env vars: ${missingShopifyConfig.join(", ")}. Add them in the root Vercel project and redeploy.`,
      }),
    };
  }

  return runLogin(request);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!hasShopifyConfig) {
    return {
      errors: loginErrorMessage({
        form: `Missing Shopify env vars: ${missingShopifyConfig.join(", ")}. Add them in the root Vercel project and redeploy.`,
      }),
    };
  }

  return runLogin(request);
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
};
