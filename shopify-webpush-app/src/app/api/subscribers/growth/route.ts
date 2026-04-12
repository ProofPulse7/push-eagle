import { NextResponse } from 'next/server';
import { z } from 'zod';

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

    const growth = await getSubscriberGrowth(shopDomain, from, to);

    return NextResponse.json({
      ok: true,
      shopDomain,
      from: from.toISOString(),
      to: to.toISOString(),
      ...growth,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscriber growth.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
