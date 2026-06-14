import { NextResponse } from 'next/server';
import { z } from 'zod';

import { API_KV_TTL, withShopApiKvCache } from '@/lib/server/cache/api-kv-cache';
import { getSubscriberGrowth } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      from: url.searchParams.get('from') ?? undefined,
      to: url.searchParams.get('to') ?? undefined,
    });

    const now = new Date();
    const from = parsed.from ? new Date(parsed.from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const to = parsed.to ? new Date(parsed.to) : now;
    const cacheScope = `subscriber-growth:${from.toISOString().slice(0, 10)}:${to.toISOString().slice(0, 10)}`;

    const payload = await withShopApiKvCache(
      shopDomain,
      cacheScope,
      API_KV_TTL.subscribersOverview,
      async () => {
        const growth = await getSubscriberGrowth(shopDomain, from, to);
        return {
          ok: true as const,
          shopDomain,
          from: from.toISOString(),
          to: to.toISOString(),
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
