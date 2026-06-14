import { NextResponse } from 'next/server';

import { invalidateShopDashboardCaches } from '@/lib/server/cache/api-kv-cache';
import { deleteSegment } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  context: { params: { id: string } },
) {
  try {
    const shopDomain = extractShopDomain(request);
    const segmentId = context.params.id?.trim();

    if (!segmentId) {
      return NextResponse.json({ ok: false, error: 'Segment id is required.' }, { status: 400 });
    }

    await deleteSegment(shopDomain, segmentId);
    void invalidateShopDashboardCaches(shopDomain);

    return NextResponse.json({ ok: true, segmentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete segment.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
