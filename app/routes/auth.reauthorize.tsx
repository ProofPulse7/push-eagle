import type { LoaderFunctionArgs } from "react-router";

import { buildOAuthInstallUrl, purgeOfflineSession } from "../lib/acquire-offline-token.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim().toLowerCase();

  if (!shop?.endsWith(".myshopify.com")) {
    return new Response("Missing or invalid shop parameter.", { status: 400 });
  }

  await purgeOfflineSession(shop);
  return Response.redirect(buildOAuthInstallUrl(shop), 302);
};
