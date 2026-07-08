import { NextResponse } from 'next/server';

import { getSegmentFilterOptions } from '@/lib/server/data/store';
import { listSegmentCustomAttributes } from '@/lib/server/segment-custom-attributes';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const [options, customAttributes] = await Promise.all([
      getSegmentFilterOptions(shopDomain),
      listSegmentCustomAttributes(shopDomain),
    ]);
    return NextResponse.json({ ok: true, ...options, customAttributes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch segment filter options.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
