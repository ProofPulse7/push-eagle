import { NextResponse } from 'next/server';

import { API_KV_TTL, withShopApiKvCache } from '@/lib/server/cache/api-kv-cache';
import { EARLY_SUBSCRIBER_SYNC_MAX } from '@/lib/constants/subscriber-sync';
import { countActiveDeliverableSubscribers, getSubscriberBreakdown, getSubscriberKpis, getSubscriberLocationBreakdown } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const loadSubscriberOverview = async (shopDomain: string) => {
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
};

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const liveCount = await countActiveDeliverableSubscribers(shopDomain);

    const payload =
      liveCount < EARLY_SUBSCRIBER_SYNC_MAX
        ? await loadSubscriberOverview(shopDomain)
        : await withShopApiKvCache(
            shopDomain,
            'subscribers-overview',
            API_KV_TTL.subscribersOverview,
            () => loadSubscriberOverview(shopDomain),
          );

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control':
          liveCount < EARLY_SUBSCRIBER_SYNC_MAX
            ? 'private, no-store'
            : 'private, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscriber overview.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
