import { NextResponse } from 'next/server';

import { API_KV_TTL, withShopApiKvCache } from '@/lib/server/cache/api-kv-cache';
import { getSubscriberBreakdown, getSubscriberKpis, getSubscriberLocationBreakdown } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const payload = await withShopApiKvCache(
      shopDomain,
      'subscribers-overview',
      API_KV_TTL.subscribersOverview,
      async () => {
        const [kpis, breakdown, locations] = await Promise.all([
          getSubscriberKpis(shopDomain),
          getSubscriberBreakdown(shopDomain),
          getSubscriberLocationBreakdown(shopDomain),
        ]);

        return {
          ok: true as const,
          shopDomain,
          ...kpis,
          browsers: breakdown.browsers,
          platforms: breakdown.platforms,
          countries: locations.countries,
          cities: locations.cities,
        };
      },
    );

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscriber overview.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
