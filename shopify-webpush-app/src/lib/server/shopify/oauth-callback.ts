import { createHmac, timingSafeEqual } from 'crypto';

import { neon } from '@neondatabase/serverless';

import {
  isValidPostgresConnectionString,
  sanitizePostgresConnectionString,
} from '@/lib/config/sanitize-connection-string';
import { env } from '@/lib/config/env';
import { resolveAppEnv, resolveShopifySessionDatabaseUrl } from '@/lib/config/resolve-env';
import { persistShopifyOfflineToken } from '@/lib/server/billing/persist-shopify-token';

const verifyOAuthHmac = (params: URLSearchParams, secret: string) => {
  const hmac = params.get('hmac');
  if (!hmac || !secret) {
    return false;
  }

  const message = [...params.entries()]
    .filter(([key]) => key !== 'hmac')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const digest = createHmac('sha256', secret).update(message).digest('hex');

  try {
    return timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(hmac, 'utf8'));
  } catch {
    return false;
  }
};

const upsertOfflinePrismaSession = async (
  shopDomain: string,
  input: {
    accessToken: string;
    scope: string | null;
    expiresIn?: number;
    refreshToken?: string | null;
    refreshTokenExpiresIn?: number | null;
  },
) => {
  const sessionUrl = resolveShopifySessionDatabaseUrl(resolveAppEnv());
  const cleaned = sanitizePostgresConnectionString(sessionUrl);
  if (!cleaned || !isValidPostgresConnectionString(cleaned)) {
    return;
  }

  const sql = neon(cleaned);
  const shop = shopDomain.trim().toLowerCase();
  const offlineId = `offline_${shop}`;
  const expires = input.expiresIn
    ? new Date(Date.now() + input.expiresIn * 1000)
    : null;
  const refreshTokenExpires =
    input.refreshToken && input.refreshTokenExpiresIn
      ? new Date(Date.now() + input.refreshTokenExpiresIn * 1000)
      : null;

  const attempts = [
    () => sql`
      INSERT INTO public."Session" (
        id,
        shop,
        state,
        "isOnline",
        "accessToken",
        scope,
        expires,
        "refreshToken",
        "refreshTokenExpires"
      )
      VALUES (
        ${offlineId},
        ${shop},
        ${'oauth'},
        ${false},
        ${input.accessToken},
        ${input.scope},
        ${expires},
        ${input.refreshToken ?? null},
        ${refreshTokenExpires}
      )
      ON CONFLICT (id) DO UPDATE SET
        shop = EXCLUDED.shop,
        "accessToken" = EXCLUDED."accessToken",
        scope = EXCLUDED.scope,
        expires = EXCLUDED.expires,
        "refreshToken" = EXCLUDED."refreshToken",
        "refreshTokenExpires" = EXCLUDED."refreshTokenExpires"
    `,
    () => sql`
      INSERT INTO shopify_sessions."Session" (
        id,
        shop,
        state,
        "isOnline",
        "accessToken",
        scope,
        expires,
        "refreshToken",
        "refreshTokenExpires"
      )
      VALUES (
        ${offlineId},
        ${shop},
        ${'oauth'},
        ${false},
        ${input.accessToken},
        ${input.scope},
        ${expires},
        ${input.refreshToken ?? null},
        ${refreshTokenExpires}
      )
      ON CONFLICT (id) DO UPDATE SET
        shop = EXCLUDED.shop,
        "accessToken" = EXCLUDED."accessToken",
        scope = EXCLUDED.scope,
        expires = EXCLUDED.expires,
        "refreshToken" = EXCLUDED."refreshToken",
        "refreshTokenExpires" = EXCLUDED."refreshTokenExpires"
    `,
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
      return;
    } catch {
      // try next schema
    }
  }
};

export const completeShopifyOAuthCallback = async (request: Request) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop')?.trim().toLowerCase();
  const code = url.searchParams.get('code');

  if (!shop?.endsWith('.myshopify.com')) {
    return { ok: false as const, error: 'Invalid shop domain.', status: 400 };
  }

  if (!code) {
    return { ok: false as const, error: 'Missing OAuth code.', status: 400 };
  }

  const secret = env.SHOPIFY_API_SECRET.trim();
  if (!verifyOAuthHmac(url.searchParams, secret)) {
    return { ok: false as const, error: 'Invalid OAuth signature.', status: 401 };
  }

  const clientId = env.SHOPIFY_API_KEY.trim();
  if (!clientId || !secret) {
    return { ok: false as const, error: 'Shopify API credentials are not configured.', status: 500 };
  }

  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: secret,
      code,
    }),
  });

  const payload = (await tokenResponse.json().catch(() => null)) as {
    access_token?: string;
    scope?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    error?: string;
  } | null;

  if (!tokenResponse.ok || !payload?.access_token) {
    const detail = payload?.error || `HTTP ${tokenResponse.status}`;
    return {
      ok: false as const,
      error: `Shopify token exchange failed: ${detail}`,
      status: 502,
    };
  }

  await upsertOfflinePrismaSession(shop, {
    accessToken: payload.access_token,
    scope: payload.scope ?? null,
    expiresIn: payload.expires_in,
    refreshToken: payload.refresh_token ?? null,
    refreshTokenExpiresIn: payload.refresh_token_expires_in ?? null,
  });

  const saved = await persistShopifyOfflineToken({
    shopDomain: shop,
    offlineAccessToken: payload.access_token,
    scopes: payload.scope ?? null,
    source: 'dashboard_oauth_callback',
  });

  if (!saved.saved) {
    return {
      ok: false as const,
      error: 'OAuth succeeded but the offline token could not be saved.',
      status: 500,
    };
  }

  const redirectTo = new URL('/dashboard', env.NEXT_PUBLIC_APP_URL);
  redirectTo.searchParams.set('shop', shop);

  return { ok: true as const, redirectTo: redirectTo.toString() };
};
