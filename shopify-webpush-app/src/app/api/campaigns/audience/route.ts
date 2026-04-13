import { NextResponse } from 'next/server';

import { countCampaignAudienceTokens, listSegments } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const dynamicSegments = await listSegments(shopDomain);

    const [allCount, segmentCounts] = await Promise.all([
      countCampaignAudienceTokens(shopDomain, 'all'),
      Promise.all(dynamicSegments.map((segment) => countCampaignAudienceTokens(shopDomain, segment.id))),
    ]);

    return NextResponse.json({
      ok: true,
      shopDomain,
      segments: [
        {
          id: 'all',
          name: 'All Subscribers',
          count: allCount,
        },
        ...dynamicSegments.map((segment, index) => ({
          id: segment.id,
          name: segment.name,
          count: Number(segmentCounts[index] ?? 0),
        })),
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign audience.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
