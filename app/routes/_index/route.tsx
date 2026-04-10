import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { hasShopifyConfig, missingShopifyConfig } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return {
    showForm: hasShopifyConfig,
    missingConfig: missingShopifyConfig,
  };
};

export default function App() {
  const { showForm, missingConfig } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Push Eagle for Shopify</h1>
        <p className={styles.text}>
          Connect your Shopify store, collect browser subscribers, and run web push campaigns from your
          dashboard.
        </p>
        {!showForm && (
          <p className={styles.text}>
            This deployment is missing required Shopify env vars: {missingConfig.join(", ")}. Add them in the
            root Vercel project settings, then redeploy.
          </p>
        )}
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: your-store.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Continue to Shopify Login
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Storefront opt-in</strong>. Use the theme extension block to collect push subscribers on
            storefront pages.
          </li>
          <li>
            <strong>Campaign delivery</strong>. Send targeted notifications with Firebase-backed delivery and
            click tracking.
          </li>
          <li>
            <strong>Attribution analytics</strong>. Measure campaign impact with conversion attribution from
            Shopify orders.
          </li>
        </ul>
      </div>
    </div>
  );
}
