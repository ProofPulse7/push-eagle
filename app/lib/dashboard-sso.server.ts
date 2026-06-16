import { createHmac } from "node:crypto";

const resolveDashboardUrl = () =>
  process.env.SHOPIFY_WEB_DASHBOARD_URL?.trim() ||
  process.env.WEB_DASHBOARD_URL?.trim() ||
  "https://push-eagle-dashboard.vercel.app";

export const readReturnTo = (request: Request) => {
  const requestUrl = new URL(request.url);
  const queryReturnTo = requestUrl.searchParams.get("return_to");
  if (queryReturnTo) {
    return queryReturnTo;
  }

  const cookieHeader = request.headers.get("cookie") || "";
  const entry = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("pe_return_to="));

  if (!entry) {
    return null;
  }

  return decodeURIComponent(entry.slice("pe_return_to=".length));
};

type DashboardSsoOptions = {
  host?: string | null;
  embedded?: string | null;
};

export const buildDashboardSsoUrl = (
  shopDomain: string,
  returnTo?: string | null,
  baseDashboardUrl = resolveDashboardUrl(),
  options?: DashboardSsoOptions,
) => {
  let redirectPath = "/dashboard";

  if (returnTo) {
    try {
      const parsed = new URL(returnTo);
      const dashboardOrigin = new URL(baseDashboardUrl).origin;
      if (parsed.origin === dashboardOrigin) {
        redirectPath = `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      // Fall back to /dashboard.
    }
  }

  const ssoUrl = new URL("/api/integrations/shopify/sso", baseDashboardUrl);
  ssoUrl.searchParams.set("shop", shopDomain);
  ssoUrl.searchParams.set("redirect", redirectPath.startsWith("/") ? redirectPath : "/dashboard");

  if (options?.host) {
    ssoUrl.searchParams.set("host", options.host);
  }
  if (options?.embedded) {
    ssoUrl.searchParams.set("embedded", options.embedded);
  }

  const secret =
    process.env.SHOPIFY_DASHBOARD_SSO_SECRET?.trim() || process.env.SHOPIFY_API_SECRET?.trim() || "";
  if (secret) {
    const ts = String(Date.now());
    const sig = createHmac("sha256", secret).update(`${shopDomain}.${ts}`).digest("hex");
    ssoUrl.searchParams.set("ts", ts);
    ssoUrl.searchParams.set("sig", sig);
  }

  return ssoUrl.toString();
};

export { resolveDashboardUrl };
