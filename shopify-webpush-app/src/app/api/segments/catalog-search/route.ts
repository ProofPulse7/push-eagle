import { NextResponse } from 'next/server';

import { searchSegmentCollections, searchSegmentProducts } from '@/lib/server/segments/catalog-search';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const url = new URL(request.url);
    const type = url.searchParams.get('type')?.trim().toLowerCase();
    const query = url.searchParams.get('q')?.trim() ?? '';

    if (!query) {
      return NextResponse.json({ ok: true, results: [] });
    }

    if (type !== 'product' && type !== 'collection') {
      return NextResponse.json({ ok: false, error: 'type must be product or collection.' }, { status: 400 });
    }

    const results =
      type === 'product'
        ? await searchSegmentProducts(shopDomain, query)
        : await searchSegmentCollections(shopDomain, query);

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to search catalog.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
