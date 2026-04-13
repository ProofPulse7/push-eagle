import { NextResponse } from 'next/server';

import { getMerchantOverview } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const overview = await getMerchantOverview(shopDomain);
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
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign audience.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
