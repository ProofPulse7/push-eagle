import { NextResponse } from 'next/server';

import { getSubscriberBreakdown, getSubscriberKpis, getSubscriberLocationBreakdown } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const [kpis, breakdown, locations] = await Promise.all([
      getSubscriberKpis(shopDomain),
      getSubscriberBreakdown(shopDomain),
      getSubscriberLocationBreakdown(shopDomain),
    ]);

    return NextResponse.json({
      ok: true,
      shopDomain,
      ...kpis,
      browsers: breakdown.browsers,
      platforms: breakdown.platforms,
      countries: locations.countries,
      cities: locations.cities,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscriber overview.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
