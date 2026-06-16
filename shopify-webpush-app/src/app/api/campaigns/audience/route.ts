import { NextResponse } from 'next/server';

import { API_KV_TTL, withShopApiKvCache } from '@/lib/server/cache/api-kv-cache';
import { countCampaignAudienceTokens, listSegments } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);

    const payload = await withShopApiKvCache(
      shopDomain,
      'campaign-audience',
      API_KV_TTL.segments,
      async () => {
        const [allAudienceCount, dynamicSegments] = await Promise.all([
          countCampaignAudienceTokens(shopDomain, 'all'),
          listSegments(shopDomain, { preferCache: true }),
        ]);

        return {
          ok: true as const,
          shopDomain,
          segments: [
            {
              id: 'all',
              name: 'All Subscribers',
              count: allAudienceCount,
            },
            ...dynamicSegments.map((segment) => ({
              id: segment.id,
              name: segment.name,
              count: Number(segment.subscriberCount ?? 0),
            })),
          ],
        };
      },
    );

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=600' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign audience.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
