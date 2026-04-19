import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAutomationOverview } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

const getRequestErrorMessage = (error: unknown) => {
  if (error instanceof z.ZodError) {
    return 'Missing shop context. Re-open the app from Shopify and try again.';
  }

  return error instanceof Error ? error.message : 'Failed to load automation overview.';
};

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const overview = await getAutomationOverview(shopDomain);

    return NextResponse.json(
      { ok: true, ...overview },
      {
        headers: {
          'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getRequestErrorMessage(error) },
      { status: 400 },
    );
  }
}