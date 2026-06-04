import { createHmac, timingSafeEqual } from "node:crypto";

import type { ActionFunctionArgs } from "react-router";

import db from "../../../../../db.server";

type BillingRequestBody = {
  shopDomain?: string;
  ts?: number;
  planName?: string;
  priceUsd?: number;
  returnUrl?: string;
  test?: boolean;
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

const CREATE_SUBSCRIPTION = `
  mutation AppSubscriptionCreate(
    $name: String!
    $returnUrl: URL!
    $test: Boolean
    $lineItems: [AppSubscriptionLineItemInput!]!
  ) {
    appSubscriptionCreate(
      name: $name
      returnUrl: $returnUrl
      test: $test
      replacementBehavior: APPLY_IMMEDIATELY
      lineItems: $lineItems
    ) {
      confirmationUrl
      appSubscription {
        id
        status
      }
      userErrors {
        field
        message
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
    const body = (await request.json()) as BillingRequestBody;
    const shopDomain = parseShop(body.shopDomain);
    const ts = Number(body.ts || 0);
    const priceUsd = Number(body.priceUsd ?? 0);
    const planName = String(body.planName || "Push Eagle Business").trim();
    const returnUrl = String(body.returnUrl || "").trim();

    if (!Number.isFinite(ts) || !verifySignature(shopDomain, ts, signature)) {
      return Response.json({ ok: false, error: "Invalid signature." }, { status: 401 });
    }

    if (!returnUrl) {
      return Response.json({ ok: false, error: "Missing returnUrl." }, { status: 400 });
    }

    if (priceUsd <= 0) {
      return Response.json({ ok: false, error: "Paid plans require priceUsd > 0." }, { status: 400 });
    }

    const session =
      (await db.session.findFirst({ where: { shop: shopDomain, isOnline: false } })) ||
      (await db.session.findFirst({ where: { shop: shopDomain }, orderBy: { expires: "desc" } }));

    if (!session?.accessToken) {
      return Response.json(
        { ok: false, error: "No Shopify session found. Open the app from Shopify admin first." },
        { status: 404 },
      );
    }

    const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2025-10";
    const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({
        query: CREATE_SUBSCRIPTION,
        variables: {
          name: planName,
          returnUrl,
          test: Boolean(body.test) || process.env.SHOPIFY_BILLING_TEST === "true",
          lineItems: [
            {
              plan: {
                appRecurringPricingDetails: {
                  price: { amount: priceUsd, currencyCode: "USD" },
                  interval: "EVERY_30_DAYS",
                },
              },
            },
          ],
        },
      }),
    });

    const payload = (await response.json()) as {
      data?: {
        appSubscriptionCreate?: {
          confirmationUrl?: string | null;
          appSubscription?: { id?: string; status?: string };
          userErrors?: Array<{ message?: string }>;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    const result = payload.data?.appSubscriptionCreate;
    const userError = result?.userErrors?.[0]?.message || payload.errors?.[0]?.message;
    if (userError) {
      return Response.json({ ok: false, error: userError }, { status: 400 });
    }

    const confirmationUrl = result?.confirmationUrl;
    if (!confirmationUrl) {
      return Response.json({ ok: false, error: "Shopify did not return a confirmation URL." }, { status: 502 });
    }

    return Response.json({
      ok: true,
      confirmationUrl,
      subscriptionId: result?.appSubscription?.id ?? null,
      status: result?.appSubscription?.status ?? "PENDING",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Shopify subscription.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
};
