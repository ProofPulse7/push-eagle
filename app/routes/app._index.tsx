import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

const buildDashboardUrl = (baseDashboardUrl: string, shopDomain: string) => {
  const url = new URL("/dashboard", baseDashboardUrl);
  url.searchParams.set("shop", shopDomain);
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
      ? buildDashboardUrl(dashboardUrl, shopDomain)
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
