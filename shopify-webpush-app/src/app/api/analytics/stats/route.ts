import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAnalyticsStats } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const getRequestErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof z.ZodError) {
    return 'Missing shop context. Re-open the app from Shopify and try again.';
  }
  return error instanceof Error ? error.message : fallback;
};

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const stats = await getAnalyticsStats(
      shopDomain,
      from ? new Date(from) : null,
      to ? new Date(to) : null,
    );

    return NextResponse.json({ ok: true, ...stats });
  } catch (error) {
    const message = getRequestErrorMessage(error, 'Failed to fetch analytics stats.');
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
