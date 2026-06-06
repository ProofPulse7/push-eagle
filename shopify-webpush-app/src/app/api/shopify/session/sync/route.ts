import { createHmac, timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { refreshShopifySessionLocally } from '@/lib/server/billing/refresh-shopify-session';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const MAX_AGE_MS = 5 * 60 * 1000;

const secureEqualHex = (a: string, b: string) => {
  const aBuffer = Buffer.from(a, 'hex');
  const bBuffer = Buffer.from(b, 'hex');
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
};

const verifySignature = (shopDomain: string, ts: number, signature: string) => {
  const secret = env.SHOPIFY_DASHBOARD_SSO_SECRET || env.SHOPIFY_API_SECRET;
  if (!secret) {
    return false;
  }

  const age = Math.abs(Date.now() - ts);
  if (age > MAX_AGE_MS) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(`${shopDomain}.${ts}`).digest('hex');
  return secureEqualHex(expected, signature);
};

export async function POST(request: Request) {
  try {
    const signature = request.headers.get('x-push-eagle-signature') || '';
    const body = (await request.json()) as { shopDomain?: string; ts?: number };
    const shopDomain = parseShopDomain(body.shopDomain || '');
    const ts = Number(body.ts || 0);

    if (!Number.isFinite(ts) || !verifySignature(shopDomain, ts, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid signature.' }, { status: 401 });
    }

    const result = await refreshShopifySessionLocally(shopDomain);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
    }

    return NextResponse.json({ ok: true, shopDomain, synced: true, result: result.result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync session.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
