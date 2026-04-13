import { NextResponse } from 'next/server';

import { getMerchantOverview, listSegments } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const overview = await getMerchantOverview(shopDomain);
    const dynamicSegments = await listSegments(shopDomain);
    const subscriberCount = Number(overview.subscriberCount ?? 0);

    return NextResponse.json({
      ok: true,
      shopDomain,
      segments: [
        {
          id: 'all',
          name: 'All Subscribers',
          count: subscriberCount,
        },
        ...dynamicSegments.map((segment) => ({
          id: segment.id,
          name: segment.name,
          count: segment.subscriberCount,
        })),
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign audience.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
