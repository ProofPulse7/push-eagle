import { NextResponse } from 'next/server';
import { z } from 'zod';

import { API_KV_TTL, withShopApiKvCache } from '@/lib/server/cache/api-kv-cache';
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
    const payload = await withShopApiKvCache(
      shopDomain,
      'automations-overview',
      API_KV_TTL.automationsOverview,
      async () => {
        const overview = await getAutomationOverview(shopDomain);
        return { ok: true as const, ...overview };
      },
    );

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getRequestErrorMessage(error) },
      { status: 400 },
    );
  }
}
