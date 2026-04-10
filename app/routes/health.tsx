import type { LoaderFunctionArgs } from "react-router";

import { hasShopifyConfig, missingShopifyConfig } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  return Response.json({
    ok: true,
    hasShopifyConfig,
    missingShopifyConfig,
    appUrl: process.env.SHOPIFY_APP_URL || process.env.VERCEL_URL || null,
    host: url.host,
    timestamp: new Date().toISOString(),
  });
};
