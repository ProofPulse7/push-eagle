import { NextResponse } from 'next/server';

import { ensureShopifyOfflineAccessToken } from '@/lib/server/billing/refresh-shopify-session';
import { getShopifyStoreCredentials } from '@/lib/server/billing/shopify-credentials-store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { shopDomain?: string };
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const token = await ensureShopifyOfflineAccessToken(shopDomain);

    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No Shopify session for this store. Open Push Eagle from Shopify admin once, then try again.',
        },
        { status: 404 },
      );
    }

    const credentials = await getShopifyStoreCredentials(shopDomain);

    return NextResponse.json({
      ok: true,
      shopDomain,
      hasToken: true,
      credentialsSaved: Boolean(credentials?.offlineAccessToken),
      verifiedAt: credentials?.verifiedAt ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh Shopify session.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
