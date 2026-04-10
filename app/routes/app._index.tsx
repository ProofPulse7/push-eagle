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

  return { dashboardUrl };
};

export default function Index() {
  const shopify = useAppBridge();
  const { dashboardUrl } = useLoaderData<typeof loader>();

  const openDashboard = () => {
    if (!dashboardUrl) {
      shopify.toast.show("Set SHOPIFY_WEB_DASHBOARD_URL to your Vercel URL.");
      return;
    }
    window.open(dashboardUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <s-page heading="Push Eagle Dashboard">
      <s-button slot="primary-action" onClick={openDashboard}>
        Open in new tab
      </s-button>

      {!dashboardUrl ? (
        <s-section heading="Dashboard URL required">
          <s-paragraph>
            Set <code>SHOPIFY_WEB_DASHBOARD_URL</code> in your environment to your Vercel app URL (for
            example: <code>https://push-eagle.vercel.app</code>), then reload.
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
          Add the same URL to your theme block setting <code>Push Eagle app URL</code> and keep app proxy
          pointing to <code>/api/storefront</code> on this app.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
