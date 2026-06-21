import { NextResponse } from 'next/server';

import { countActiveDeliverableSubscribers } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

/** Lightweight live count — no KV cache so early opt-ins reflect immediately. */
export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const totalSubscribers = await countActiveDeliverableSubscribers(shopDomain);

    return NextResponse.json(
      {
        ok: true,
        shopDomain,
        totalSubscribers,
        activeSubscribers: totalSubscribers,
      },
      {
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscriber count.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
