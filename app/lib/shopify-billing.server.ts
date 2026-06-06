import { createHmac, timingSafeEqual } from "node:crypto";

import db from "../db.server";

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

export const verifyDashboardSignature = (shopDomain: string, ts: number, signature: string) => {
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

export const parseShopDomain = (value: unknown) => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw.endsWith(".myshopify.com")) {
    throw new Error("Invalid shop domain.");
  }
  return raw;
};

const readTokenFromRows = (rows: Array<{ accessToken?: string }>) => {
  const token = rows[0]?.accessToken;
  return typeof token === "string" && token.length > 0 ? token : null;
};

export const getOfflineAccessToken = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const offlineId = `offline_${shop}`;

  const prismaSession =
    (await db.session.findFirst({ where: { shop, isOnline: false } })) ||
    (await db.session.findFirst({ where: { id: offlineId } })) ||
    (await db.session.findFirst({ where: { shop, isOnline: false }, orderBy: { expires: "desc" } }));

  if (prismaSession?.accessToken) {
    return prismaSession.accessToken;
  }

  const publicAttempts = [
    `SELECT "accessToken" FROM public."Session" WHERE id = $1 LIMIT 1`,
    `SELECT "accessToken" FROM public."Session" WHERE shop = $1 AND "isOnline" = false ORDER BY expires DESC NULLS LAST LIMIT 1`,
    `SELECT "accessToken" FROM shopify_sessions."Session" WHERE id = $1 LIMIT 1`,
    `SELECT "accessToken" FROM shopify_sessions."Session" WHERE shop = $1 AND "isOnline" = false ORDER BY expires DESC NULLS LAST LIMIT 1`,
  ];

  for (const query of publicAttempts) {
    try {
      const usesShopOnly = query.includes("shop = $1");
      const rows = usesShopOnly
        ? await db.$queryRawUnsafe<Array<{ accessToken?: string }>>(query, shop)
        : await db.$queryRawUnsafe<Array<{ accessToken?: string }>>(query, offlineId);
      const token = readTokenFromRows(rows);
      if (token) {
        return token;
      }
    } catch {
      // try next query
    }
  }

  return null;
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

export const createShopifySubscription = async (input: {
  shopDomain: string;
  planName: string;
  priceUsd: number;
  returnUrl: string;
  test?: boolean;
}) => {
  const accessToken = await getOfflineAccessToken(input.shopDomain);
  if (!accessToken) {
    throw new Error("No Shopify session found. Open the app from Shopify admin first.");
  }

  const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2025-10";
  const response = await fetch(`https://${input.shopDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({
      query: CREATE_SUBSCRIPTION,
      variables: {
        name: input.planName,
        returnUrl: input.returnUrl,
        test: Boolean(input.test) || process.env.SHOPIFY_BILLING_TEST === "true",
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: input.priceUsd, currencyCode: "USD" },
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
    throw new Error(userError);
  }

  const confirmationUrl = result?.confirmationUrl;
  if (!confirmationUrl) {
    throw new Error("Shopify did not return a confirmation URL.");
  }

  return {
    confirmationUrl,
    subscriptionId: result?.appSubscription?.id ?? null,
    status: result?.appSubscription?.status ?? "PENDING",
  };
};

export const handleBillingCreateRequest = async (request: Request) => {
  if (request.method.toUpperCase() !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed." }, { status: 405 });
  }

  const signature = request.headers.get("x-push-eagle-signature") || "";
  const body = (await request.json()) as BillingRequestBody;
  const shopDomain = parseShopDomain(body.shopDomain);
  const ts = Number(body.ts || 0);
  const priceUsd = Number(body.priceUsd ?? 0);
  const planName = String(body.planName || "Push Eagle Business").trim();
  const returnUrl = String(body.returnUrl || "").trim();

  if (!Number.isFinite(ts) || !verifyDashboardSignature(shopDomain, ts, signature)) {
    return Response.json({ ok: false, error: "Invalid signature." }, { status: 401 });
  }

  if (!returnUrl) {
    return Response.json({ ok: false, error: "Missing returnUrl." }, { status: 400 });
  }

  if (priceUsd <= 0) {
    return Response.json({ ok: false, error: "Paid plans require priceUsd > 0." }, { status: 400 });
  }

  try {
    const result = await createShopifySubscription({
      shopDomain,
      planName,
      priceUsd,
      returnUrl,
      test: Boolean(body.test),
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Shopify subscription.";
    const status = message.includes("No Shopify session") ? 404 : 400;
    return Response.json({ ok: false, error: message }, { status });
  }
};
