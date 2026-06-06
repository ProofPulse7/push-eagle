import { NextResponse } from 'next/server';

import { getShopAuthStatus } from '@/lib/server/shopify-auth';
import { tryExtractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = tryExtractShopDomain(request);
    const status = await getShopAuthStatus(shopDomain);

    return NextResponse.json({
      ok: true,
      ...status,
      oauthUrl: shopDomain
        ? null
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check auth status.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
