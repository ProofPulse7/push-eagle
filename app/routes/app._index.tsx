import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { createHmac } from "node:crypto";
import { redirect, useLoaderData } from "react-router";
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

const resolveDashboardUrl = () =>
  process.env.SHOPIFY_WEB_DASHBOARD_URL?.trim() ||
  process.env.WEB_DASHBOARD_URL?.trim() ||
  "https://push-eagle-dashboard.vercel.app";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const auth = await authenticate.admin(request);
  const shopDomain = auth.session?.shop ?? "";

  const dashboardUrl = resolveDashboardUrl();

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

  const externalDashboardUrl =
    dashboardUrl && shopDomain && !dashboardNeedsSeparateDeploy
      ? buildDashboardSsoUrl(dashboardUrl, shopDomain)
      : dashboardUrl;

  if (externalDashboardUrl && !dashboardNeedsSeparateDeploy) {
    throw redirect(externalDashboardUrl);
  }

  return { dashboardUrl, dashboardNeedsSeparateDeploy };
};

export default function Index() {
  const { dashboardUrl, dashboardNeedsSeparateDeploy } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Dashboard Redirect">
      <s-section heading="Dashboard URL required">
        <s-paragraph>
          {!dashboardUrl || dashboardNeedsSeparateDeploy
            ? "Set SHOPIFY_WEB_DASHBOARD_URL to your deployed dashboard app URL (https://push-eagle-dashboard.vercel.app)."
            : "Redirecting to dashboard..."}
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
