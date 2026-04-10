import { createHmac, timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { ensureMerchantAccount } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const MAX_SSO_AGE_MS = 5 * 60 * 1000;

const secureEqual = (a: string, b: string) => {
  const aBuffer = Buffer.from(a, 'hex');
  const bBuffer = Buffer.from(b, 'hex');

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
};

const verifySsoSignature = (shopDomain: string, ts: string, sig: string) => {
  const secret = env.SHOPIFY_DASHBOARD_SSO_SECRET || env.SHOPIFY_API_SECRET;
  if (!secret) {
    return false;
  }

  const issuedAt = Number(ts);
  if (!Number.isFinite(issuedAt)) {
    return false;
  }

  const age = Math.abs(Date.now() - issuedAt);
  if (age > MAX_SSO_AGE_MS) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(`${shopDomain}.${ts}`).digest('hex');
  return secureEqual(expected, sig);
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shopDomain = parseShopDomain(url.searchParams.get('shop'));
    const redirectPath = url.searchParams.get('redirect') || '/dashboard';
    const ts = url.searchParams.get('ts');
    const sig = url.searchParams.get('sig');

    if (ts && sig && !verifySsoSignature(shopDomain, ts, sig)) {
      return NextResponse.json({ ok: false, error: 'Invalid SSO signature.' }, { status: 401 });
    }

    await ensureMerchantAccount(shopDomain);

    const redirectUrl = new URL(redirectPath.startsWith('/') ? redirectPath : '/dashboard', env.NEXT_PUBLIC_APP_URL);
    redirectUrl.searchParams.set('shop', shopDomain);

    return NextResponse.redirect(redirectUrl, { status: 307 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid SSO request.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}