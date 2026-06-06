import type { ActionFunctionArgs } from "react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

import { getOfflineAccessToken, verifyDashboardSignature } from "../lib/shopify-billing.server";

type SyncBody = {
  shopDomain?: string;
  ts?: number;
};

const parseShop = (value: unknown) => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw.endsWith(".myshopify.com")) {
    throw new Error("Invalid shop domain.");
  }
  return raw;
};

const resolveDashboardUrl = () =>
  process.env.SHOPIFY_WEB_DASHBOARD_URL?.trim() ||
  process.env.WEB_DASHBOARD_URL?.trim() ||
  "https://push-eagle-dashboard.vercel.app";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    if (request.method.toUpperCase() !== "POST") {
      return Response.json({ ok: false, error: "Method not allowed." }, { status: 405 });
    }

    const signature = request.headers.get("x-push-eagle-signature") || "";
    const body = (await request.json()) as SyncBody;
    const shopDomain = parseShop(body.shopDomain);
    const ts = Number(body.ts || 0);

    if (!Number.isFinite(ts) || !verifyDashboardSignature(shopDomain, ts, signature)) {
      return Response.json({ ok: false, error: "Invalid signature." }, { status: 401 });
    }

    const accessToken = await getOfflineAccessToken(shopDomain);
    if (!accessToken) {
      return Response.json(
        {
          ok: false,
          error:
            "No Shopify install session in database. Open Push Eagle from Shopify admin to install or re-authorize the app.",
        },
        { status: 404 },
      );
    }

    const dashboardUrl = resolveDashboardUrl();
    const syncTs = Date.now();
    const secret =
      process.env.SHOPIFY_DASHBOARD_SSO_SECRET?.trim() || process.env.SHOPIFY_API_SECRET?.trim() || "";
    const syncSig = createHmac("sha256", secret).update(`${shopDomain}.${syncTs}`).digest("hex");
    const rootUrl =
      process.env.SHOPIFY_APP_URL?.trim() ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://push-eagle.vercel.app");

    const syncResponse = await fetch(new URL("/api/integrations/shopify/merchant-profile", dashboardUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Push-Eagle-Signature": syncSig,
        "X-Push-Eagle-Source": rootUrl,
      },
      body: JSON.stringify({
        shopDomain,
        ts: syncTs,
        myshopifyDomain: shopDomain,
        shopifyOfflineAccessToken: accessToken,
      }),
    });

    if (!syncResponse.ok) {
      const text = await syncResponse.text();
      return Response.json(
        { ok: false, error: `Dashboard session sync failed: ${syncResponse.status} ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }

    return Response.json({ ok: true, shopDomain, synced: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync session.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
};
