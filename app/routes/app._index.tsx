import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const dashboardUrl =
    process.env.SHOPIFY_WEB_DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.WEB_DASHBOARD_URL ||
    "";

  let dashboardNeedsSeparateDeploy = false;

  if (dashboardUrl) {
    try {
      const requestUrl = new URL(request.url);
      const resolvedDashboardUrl = new URL(dashboardUrl);

      dashboardNeedsSeparateDeploy =
        resolvedDashboardUrl.origin === requestUrl.origin &&
        (resolvedDashboardUrl.pathname === "/" || resolvedDashboardUrl.pathname === requestUrl.pathname);
    } catch {
      dashboardNeedsSeparateDeploy = false;
    }
  }

  return { dashboardUrl, dashboardNeedsSeparateDeploy };
};

export default function Index() {
  const shopify = useAppBridge();
  const { dashboardUrl, dashboardNeedsSeparateDeploy } = useLoaderData<typeof loader>();

  const openDashboard = () => {
    if (!dashboardUrl || dashboardNeedsSeparateDeploy) {
      shopify.toast.show("Deploy shopify-webpush-app separately and set SHOPIFY_WEB_DASHBOARD_URL to that URL.");
      return;
    }
    window.open(dashboardUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <s-page heading="Push Eagle Dashboard">
      <s-button slot="primary-action" onClick={openDashboard}>
        Open in new tab
      </s-button>

      {!dashboardUrl || dashboardNeedsSeparateDeploy ? (
        <s-section heading="Dashboard URL required">
          <s-paragraph>
            Deploy <code>shopify-webpush-app</code> as a separate Vercel project, then set
            <code> SHOPIFY_WEB_DASHBOARD_URL </code>
            in the root Shopify app environment to that deployed URL. The current value points back to this
            same app, so embedding would just reload the login app instead of the dashboard.
          </s-paragraph>
        </s-section>
      ) : (
        <s-section heading="Embedded Web App">
          <div
            style={{
              width: "100%",
              height: "75vh",
              borderRadius: "12px",
              overflow: "hidden",
              border: "1px solid #dfe3e8",
            }}
          >
            <iframe
              title="Push Eagle Web App"
              src={dashboardUrl}
              style={{ width: "100%", height: "100%", border: 0 }}
            />
          </div>
        </s-section>
      )}

      <s-section heading="Next Step After Vercel Deploy">
        <s-paragraph>
          After deploying <code>shopify-webpush-app</code>, use that URL in your theme block setting
          <code> Push Eagle app URL </code>
          and point Shopify app proxy to <code>/api/storefront</code> on the Next.js app.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
