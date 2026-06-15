import { NextResponse } from 'next/server';

import { API_KV_TTL, withShopApiKvCache } from '@/lib/server/cache/api-kv-cache';
import { getSubscriberGrowth } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const url = new URL(request.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const isAllTime = !fromParam && !toParam;

    const now = new Date();
    const from = fromParam && fromParam !== 'all' ? new Date(fromParam) : null;
    const to = toParam && toParam !== 'all' ? new Date(toParam) : isAllTime ? now : now;
    const cacheScope = isAllTime
      ? 'subscriber-growth:all'
      : `subscriber-growth:${(from ?? now).toISOString().slice(0, 10)}:${to.toISOString().slice(0, 10)}`;

    const payload = await withShopApiKvCache(
      shopDomain,
      cacheScope,
      API_KV_TTL.subscribersOverview,
      async () => {
        const growth = await getSubscriberGrowth(shopDomain, from, to);
        return {
          ok: true as const,
          shopDomain,
          from: growth.from.toISOString(),
          to: growth.to.toISOString(),
          ...growth,
        };
      },
    );

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=600' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscriber growth.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
