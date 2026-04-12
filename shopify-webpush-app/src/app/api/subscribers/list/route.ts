import { NextResponse } from 'next/server';
import { z } from 'zod';

import { listSubscribers } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['asc', 'desc']).default('desc'),
});

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
      sort: url.searchParams.get('sort') ?? undefined,
    });

    const data = await listSubscribers(shopDomain, parsed.limit, parsed.offset, parsed.sort);

    return NextResponse.json({
      ok: true,
      shopDomain,
      ...data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch subscriber list.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
