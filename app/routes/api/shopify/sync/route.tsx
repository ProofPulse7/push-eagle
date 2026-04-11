import { createHmac, timingSafeEqual } from "node:crypto";

import type { ActionFunctionArgs } from "react-router";

import db from "../../../../db.server";
import { syncMerchantProfileToDashboard, syncRecentCustomersToDashboard } from "../../../../shopify.server";

type SyncRequestBody = {
  shopDomain?: string;
  ts?: number;
};

const MAX_AGE_MS = 5 * 60 * 1000;

const secureEqualHex = (a: string, b: string) => {
  const aBuffer = Buffer.from(a, "hex");
  const bBuffer = Buffer.from(b, "hex");
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
};

const verifySignature = (shopDomain: string, ts: number, signature: string) => {
  const secret = process.env.SHOPIFY_DASHBOARD_SSO_SECRET?.trim() || process.env.SHOPIFY_API_SECRET?.trim() || "";
  if (!secret) {
    return false;
  }

  const age = Math.abs(Date.now() - ts);
  if (age > MAX_AGE_MS) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(`${shopDomain}.${ts}`).digest("hex");
  return secureEqualHex(expected, signature);
};

const parseShop = (value: unknown) => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw.endsWith(".myshopify.com")) {
    throw new Error("Invalid shop domain.");
  }
  return raw;
};

const createAdminClient = (shopDomain: string, accessToken: string) => {
  const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2025-10";

  return {
    graphql: (query: string, options?: { variables?: Record<string, unknown> }) =>
      fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query,
          variables: options?.variables || {},
        }),
      }),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    if (request.method.toUpperCase() !== "POST") {
      return Response.json({ ok: false, error: "Method not allowed." }, { status: 405 });
    }

    const signature = request.headers.get("x-push-eagle-signature") || "";
    const body = (await request.json()) as SyncRequestBody;
    const shopDomain = parseShop(body.shopDomain);
    const ts = Number(body.ts || 0);

    if (!Number.isFinite(ts) || !verifySignature(shopDomain, ts, signature)) {
      return Response.json({ ok: false, error: "Invalid signature." }, { status: 401 });
    }

    const session =
      (await db.session.findFirst({ where: { shop: shopDomain, isOnline: false } })) ||
      (await db.session.findFirst({ where: { shop: shopDomain }, orderBy: { expires: "desc" } }));

    if (!session?.accessToken) {
      return Response.json(
        { ok: false, error: "No Shopify session found for this shop. Open app in Shopify first." },
        { status: 404 },
      );
    }

    const admin = createAdminClient(shopDomain, session.accessToken);

    await syncMerchantProfileToDashboard({
      shopDomain,
      scope: session.scope || null,
      admin,
    });

    await syncRecentCustomersToDashboard({
      shopDomain,
      admin,
    });

    return Response.json({ ok: true, shopDomain, synced: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync from Shopify.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
};
