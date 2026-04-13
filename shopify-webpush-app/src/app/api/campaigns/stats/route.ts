import { NextResponse } from 'next/server';

import { getCampaignStats } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const stats = await getCampaignStats(
      shopDomain,
      from ? new Date(from) : null,
      to ? new Date(to) : null,
    );

    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign stats.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
