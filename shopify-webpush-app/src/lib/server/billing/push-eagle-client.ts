import { createHmac } from 'crypto';

import { env } from '@/lib/config/env';

const signRequest = (shopDomain: string, ts: number) => {
  const secret = env.SHOPIFY_DASHBOARD_SSO_SECRET || env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error('Missing SHOPIFY_DASHBOARD_SSO_SECRET.');
  }
  return createHmac('sha256', secret).update(`${shopDomain}.${ts}`).digest('hex');
};

export const callPushEagleBilling = async (
  path: string,
  shopDomain: string,
  body: Record<string, unknown>,
) => {
  const rootUrl = (env.SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app').replace(/\/$/, '');
  const ts = Date.now();
  const signature = signRequest(shopDomain, ts);
  const url = `${rootUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Push-Eagle-Signature': signature,
    },
    body: JSON.stringify({ shopDomain, ts, ...body }),
  });

  const text = await response.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      (typeof parsed?.error === 'string' && parsed.error) ||
      (response.status === 404
        ? `Billing API not found at ${url}. Deploy the push-eagle Shopify app or set SHOPIFY_SESSION_DATABASE_URL on the dashboard.`
        : `Billing request failed (${response.status}).`);
    throw new Error(message);
  }

  return parsed ?? { ok: true };
};
