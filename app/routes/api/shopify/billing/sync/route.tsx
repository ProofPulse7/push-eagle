import { createHmac, timingSafeEqual } from "node:crypto";

import type { ActionFunctionArgs } from "react-router";

import db from "../../../../../db.server";

type SyncBody = {
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

const ACTIVE_SUBSCRIPTIONS = `
  query ActiveSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        lineItems {
          plan {
            pricingDetails {
              ... on AppRecurringPricing {
                price {
                  amount
                  currencyCode
                }
                interval
              }
            }
          }
        }
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    if (request.method.toUpperCase() !== "POST") {
      return Response.json({ ok: false, error: "Method not allowed." }, { status: 405 });
    }

    const signature = request.headers.get("x-push-eagle-signature") || "";
    const body = (await request.json()) as SyncBody;
    const shopDomain = String(body.shopDomain || "").trim().toLowerCase();
    const ts = Number(body.ts || 0);

    if (!shopDomain.endsWith(".myshopify.com") || !Number.isFinite(ts) || !verifySignature(shopDomain, ts, signature)) {
      return Response.json({ ok: false, error: "Invalid signature." }, { status: 401 });
    }

    const session =
      (await db.session.findFirst({ where: { shop: shopDomain, isOnline: false } })) ||
      (await db.session.findFirst({ where: { shop: shopDomain }, orderBy: { expires: "desc" } }));

    if (!session?.accessToken) {
      return Response.json({ ok: false, error: "No Shopify session found." }, { status: 404 });
    }

    const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2025-10";
    const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query: ACTIVE_SUBSCRIPTIONS }),
    });

    const payload = (await response.json()) as {
      data?: {
        currentAppInstallation?: {
          activeSubscriptions?: Array<{
            id?: string;
            name?: string;
            status?: string;
            lineItems?: Array<{
              plan?: {
                pricingDetails?: {
                  price?: { amount?: string; currencyCode?: string };
                  interval?: string;
                };
              };
            }>;
          }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    const subscriptions = payload.data?.currentAppInstallation?.activeSubscriptions ?? [];
    const active = subscriptions.find((item) => item.status === "ACTIVE") ?? subscriptions[0] ?? null;
    const amount = Number(active?.lineItems?.[0]?.plan?.pricingDetails?.price?.amount ?? 0);

    return Response.json({
      ok: true,
      subscriptions,
      active: active
        ? {
            id: active.id ?? null,
            name: active.name ?? null,
            status: active.status ?? null,
            amount,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync billing.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
};
