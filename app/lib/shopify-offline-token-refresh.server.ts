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

  try {
    const { getShopifyApi } = await import("../shopify.server");
    const { session } = await getShopifyApi().auth.refreshToken({
      shop,
      refreshToken: row.refreshToken,
    });

    await db.session.update({
      where: { id: row.id },
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken ?? row.refreshToken,
        expires: session.expires ?? null,
        refreshTokenExpires: session.refreshTokenExpires ?? row.refreshTokenExpires,
        scope: session.scope ?? row.scope,
      },
    });

    return session.accessToken ?? null;
  } catch {
    return null;
  }
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
