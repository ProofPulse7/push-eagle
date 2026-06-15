import type { LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";

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
          <p className={styles.text}>
            Install Push Eagle from the Shopify App Store, then open the app from Shopify Admin. OAuth handles store
            connection automatically — no manual shop URL entry is required.
          </p>
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
            <strong>Attribution analytics</strong>. Business plans include advanced revenue attribution from Shopify
            orders.
          </li>
        </ul>
      </div>
    </div>
  );
}
