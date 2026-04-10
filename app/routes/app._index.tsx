import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { createHmac } from "node:crypto";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

const buildDashboardSsoUrl = (baseDashboardUrl: string, shopDomain: string) => {
  const secret = process.env.SHOPIFY_DASHBOARD_SSO_SECRET?.trim() || process.env.SHOPIFY_API_SECRET?.trim();
  const url = new URL("/api/integrations/shopify/sso", baseDashboardUrl);

  if (!secret) {
    url.searchParams.set("shop", shopDomain);
    url.searchParams.set("redirect", "/dashboard");
    return url.toString();
  }

  const ts = String(Date.now());
  const payload = `${shopDomain}.${ts}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");

  url.searchParams.set("shop", shopDomain);
  url.searchParams.set("ts", ts);
  url.searchParams.set("sig", sig);
  url.searchParams.set("redirect", "/dashboard");

  return url.toString();
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await authenticate.admin(request);
  const shopDomain = auth.session?.shop ?? "";

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

  const embedUrl =
    dashboardUrl && shopDomain && !dashboardNeedsSeparateDeploy
      ? buildDashboardSsoUrl(dashboardUrl, shopDomain)
      : dashboardUrl;

  return { dashboardUrl, embedUrl, dashboardNeedsSeparateDeploy };
};

export default function Index() {
  const shopify = useAppBridge();
  const { dashboardUrl, embedUrl, dashboardNeedsSeparateDeploy } = useLoaderData<typeof loader>();

  const openDashboard = () => {
    if (!dashboardUrl || dashboardNeedsSeparateDeploy) {
      shopify.toast.show("Deploy shopify-webpush-app separately and set SHOPIFY_WEB_DASHBOARD_URL to that URL.");
      return;
    }
    window.open(embedUrl || dashboardUrl, "_blank", "noopener,noreferrer");
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
        <div
          style={{
            width: "100%",
            height: "calc(100vh - 120px)",
            minHeight: "680px",
            overflow: "hidden",
          }}
        >
          <iframe
            title="Push Eagle Web App"
            src={embedUrl || dashboardUrl}
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        </div>
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
