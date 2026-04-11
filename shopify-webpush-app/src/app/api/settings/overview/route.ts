import { NextResponse } from 'next/server';

import { getMerchantOverview } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const overview = await getMerchantOverview(shopDomain);
    return NextResponse.json({ ok: true, ...overview });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch merchant overview.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
