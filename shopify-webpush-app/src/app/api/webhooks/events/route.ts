import { NextResponse } from 'next/server';

import { listWebhookEvents } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get('limit') || 100);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 500) : 100;

    const events = await listWebhookEvents(shopDomain, limit);
    return NextResponse.json({ ok: true, shopDomain, count: events.length, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch webhook events.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
