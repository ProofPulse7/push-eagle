import { createHmac, timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { getValidatedShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import { syncShopifyMerchantAndCustomers } from '@/lib/server/shopify/profile-sync';
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

    const accessToken = await getValidatedShopifyOfflineAccessToken(shopDomain);
    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No valid Shopify offline token for this shop. Open Push Eagle from Shopify admin first.',
        },
        { status: 404 },
      );
    }

    const result = await syncShopifyMerchantAndCustomers({
      shopDomain,
      accessToken,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync from Shopify.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
