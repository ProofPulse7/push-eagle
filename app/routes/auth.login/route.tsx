import { AppProvider } from "@shopify/shopify-app-react-router/react";
import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";

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

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const { errors } = loaderData;

  return (
    <AppProvider embedded={false}>
      <s-page>
        <s-section heading="Install Push Eagle from Shopify">
          {errors.form ? <s-banner tone="critical">{errors.form}</s-banner> : null}
          <s-paragraph>
            Push Eagle must be installed from the Shopify App Store or opened from Apps in your Shopify
            Admin. Shopify provides your store identity during install — manual shop URL entry is not
            required.
          </s-paragraph>
          <s-paragraph>
            If you already installed the app, open it from your Shopify Admin under Apps.
          </s-paragraph>
        </s-section>
      </s-page>
    </AppProvider>
  );
};
