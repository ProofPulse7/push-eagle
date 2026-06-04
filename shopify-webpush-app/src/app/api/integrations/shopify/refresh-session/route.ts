import { NextResponse } from 'next/server';

import { refreshShopifySessionFromRemixApp } from '@/lib/server/billing/refresh-shopify-session';
import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    await refreshShopifySessionFromRemixApp(shopDomain);
    const hasToken = Boolean(await getShopifyOfflineAccessToken(shopDomain));

    return NextResponse.json({
      ok: true,
      shopDomain,
      hasToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh Shopify session.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
