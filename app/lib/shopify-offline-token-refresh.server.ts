import db from "../db.server";

const readEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
};

const readOfflineSessionRow = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const offlineId = `offline_${shop}`;

  const prismaSession =
    (await db.session.findFirst({ where: { id: offlineId } })) ||
    (await db.session.findFirst({ where: { shop, isOnline: false }, orderBy: { expires: "desc" } }));

  if (!prismaSession?.accessToken) {
    return null;
  }

  return prismaSession;
};

export const refreshOfflineAccessToken = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const row = await readOfflineSessionRow(shop);
  if (!row?.refreshToken) {
    return null;
  }

  const clientId = readEnv("SHOPIFY_API_KEY", "SHOPIFY_CLIENT_ID");
  const clientSecret = readEnv("SHOPIFY_API_SECRET", "SHOPIFY_API_SECRET_KEY");
  if (!clientId || !clientSecret) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: row.refreshToken,
  });

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    scope?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    return null;
  }

  const expires = new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000);
  const refreshTokenExpires =
    payload.refresh_token_expires_in && (payload.refresh_token ?? row.refreshToken)
      ? new Date(Date.now() + Number(payload.refresh_token_expires_in) * 1000)
      : row.refreshTokenExpires;

  await db.session.update({
    where: { id: row.id },
    data: {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? row.refreshToken,
      expires,
      refreshTokenExpires,
      scope: payload.scope ?? row.scope,
    },
  });

  return payload.access_token;
};

export const validateShopifyAccessToken = async (shopDomain: string, accessToken: string) => {
  const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || "2025-04";
  try {
    const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query: "query { shop { name } }" }),
    });
    const payload = (await response.json().catch(() => null)) as {
      data?: { shop?: { name?: string } };
      errors?: Array<{ message?: string }>;
    } | null;
    return response.ok && Boolean(payload?.data?.shop?.name) && !payload?.errors?.length;
  } catch {
    return false;
  }
};
