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
  const rootUrl = env.SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app';
  const ts = Date.now();
  const signature = signRequest(shopDomain, ts);

  const response = await fetch(new URL(path, rootUrl), {
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
      `Billing request failed (${response.status}).`;
    throw new Error(message);
  }

  return parsed ?? { ok: true };
};
