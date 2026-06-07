import { neon } from '@neondatabase/serverless';

import { isValidPostgresConnectionString, sanitizePostgresConnectionString } from '@/lib/config/sanitize-connection-string';
import { env } from '@/lib/config/env';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { buildShopifyAppConnectUrl } from '@/lib/server/billing/shopify-connect-url';
import { persistShopifyOfflineToken } from '@/lib/server/billing/persist-shopify-token';

type OfflineSessionRow = {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expires: Date | null;
  refreshTokenExpires: Date | null;
  scope: string | null;
};

const getSessionSql = () => {
  const url = sanitizePostgresConnectionString(env.SHOPIFY_SESSION_DATABASE_URL);
  if (!url || !isValidPostgresConnectionString(url)) {
    return null;
  }
  return neon(url);
};

export const clearMerchantOfflineAccessToken = async (shopDomain: string) => {
  const sql = getNeonSql();
  const shop = shopDomain.trim().toLowerCase();
  await sql`
    UPDATE merchants
    SET shopify_offline_access_token = NULL, updated_at = NOW()
    WHERE shop_domain = ${shop}
  `;
};

export const isObviouslyInvalidStoredToken = (token: string | null | undefined) => {
  if (!token) {
    return true;
  }
  const trimmed = token.trim();
  if (trimmed.length < 32) {
    return true;
  }
  if (/test_token/i.test(trimmed)) {
    return true;
  }
  return false;
};

const readOfflineSessionRow = async (shopDomain: string): Promise<OfflineSessionRow | null> => {
  const sql = getSessionSql();
  if (!sql) {
    return null;
  }

  const shop = shopDomain.trim().toLowerCase();
  const offlineId = `offline_${shop}`;
  const attempts = [
    () => sql`
      SELECT id, "accessToken", "refreshToken", expires, "refreshTokenExpires", scope
      FROM public."Session"
      WHERE id = ${offlineId}
      LIMIT 1
    `,
    () => sql`
      SELECT id, "accessToken", "refreshToken", expires, "refreshTokenExpires", scope
      FROM public."Session"
      WHERE shop = ${shop}
        AND "isOnline" = false
      ORDER BY expires DESC NULLS LAST
      LIMIT 1
    `,
    () => sql`
      SELECT id, "accessToken", "refreshToken", expires, "refreshTokenExpires", scope
      FROM shopify_sessions."Session"
      WHERE id = ${offlineId}
      LIMIT 1
    `,
  ];

  for (const attempt of attempts) {
    try {
      const rows = await attempt();
      const row = rows[0] as OfflineSessionRow | undefined;
      if (row?.accessToken) {
        return row;
      }
    } catch {
      // try next schema
    }
  }

  return null;
};

const writeRefreshedOfflineSession = async (
  shopDomain: string,
  sessionId: string,
  input: {
    accessToken: string;
    refreshToken: string | null;
    expiresIn: number;
    refreshTokenExpiresIn: number | null;
    scope: string | null;
  },
) => {
  const sql = getSessionSql();
  if (!sql) {
    return;
  }

  const shop = shopDomain.trim().toLowerCase();
  const expires = new Date(Date.now() + input.expiresIn * 1000);
  const refreshTokenExpires =
    input.refreshTokenExpiresIn && input.refreshToken
      ? new Date(Date.now() + input.refreshTokenExpiresIn * 1000)
      : null;

  const updates = [
    () => sql`
      UPDATE public."Session"
      SET
        "accessToken" = ${input.accessToken},
        "refreshToken" = ${input.refreshToken},
        expires = ${expires},
        "refreshTokenExpires" = ${refreshTokenExpires},
        scope = COALESCE(${input.scope}, scope)
      WHERE id = ${sessionId}
    `,
    () => sql`
      UPDATE shopify_sessions."Session"
      SET
        "accessToken" = ${input.accessToken},
        "refreshToken" = ${input.refreshToken},
        expires = ${expires},
        "refreshTokenExpires" = ${refreshTokenExpires},
        scope = COALESCE(${input.scope}, scope)
      WHERE id = ${sessionId}
    `,
  ];

  for (const update of updates) {
    try {
      await update();
    } catch {
      // schema may not exist
    }
  }

  await persistShopifyOfflineToken({
    shopDomain: shop,
    offlineAccessToken: input.accessToken,
    scopes: input.scope,
    source: 'offline_token_refresh',
  });
};

export const refreshOfflineAccessToken = async (shopDomain: string) => {
  const shop = shopDomain.trim().toLowerCase();
  const row = await readOfflineSessionRow(shop);
  if (!row?.refreshToken) {
    return null;
  }

  const clientId = env.SHOPIFY_API_KEY;
  const clientSecret = env.SHOPIFY_API_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: row.refreshToken,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    return null;
  }

  await writeRefreshedOfflineSession(shop, row.id, {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? row.refreshToken,
    expiresIn: Number(payload.expires_in ?? 3600),
    refreshTokenExpiresIn: payload.refresh_token_expires_in
      ? Number(payload.refresh_token_expires_in)
      : null,
    scope: payload.scope ?? row.scope,
  });

  return payload.access_token;
};

export const purgeStalePrismaSessionForShop = async (shopDomain: string) => {
  const sql = getSessionSql();
  if (!sql) {
    return;
  }

  const shop = shopDomain.trim().toLowerCase();
  const offlineId = `offline_${shop}`;

  const attempts = [
    () => sql`DELETE FROM public."Session" WHERE id = ${offlineId}`,
    () => sql`DELETE FROM public."Session" WHERE shop = ${shop} AND "isOnline" = false`,
    () => sql`DELETE FROM shopify_sessions."Session" WHERE id = ${offlineId}`,
    () => sql`DELETE FROM shopify_sessions."Session" WHERE shop = ${shop} AND "isOnline" = false`,
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
    } catch {
      // schema may not exist
    }
  }
};

export const buildShopifyReauthorizeUrl = (shopDomain: string) =>
  buildShopifyAppConnectUrl(shopDomain);
