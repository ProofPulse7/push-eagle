import { NextResponse } from 'next/server';

import { getThemeEmbedStatus } from '@/lib/server/shopify/theme-embed-status';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const status = await getThemeEmbedStatus(shopDomain);

    return NextResponse.json({
      ok: true,
      shopDomain,
      ...status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check theme embed status.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
