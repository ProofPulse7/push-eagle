import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  analyticsKvKey,
  isCloudflareKvEnabled,
  readKvJson,
  writeKvJson,
} from '@/lib/server/cache/cloudflare-kv';
import { getAnalyticsStats } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const ANALYTICS_KV_TTL_SECONDS = 600;

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
    const fromIso = from ?? '';
    const toIso = to ?? '';

    if (isCloudflareKvEnabled() && fromIso && toIso) {
      const kvKey = analyticsKvKey(shopDomain, fromIso, toIso);
      const cached = await readKvJson<Record<string, unknown>>(kvKey);
      if (cached?.ok) {
        return NextResponse.json(cached, {
          headers: {
            'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
          },
        });
      }
    }

    const stats = await getAnalyticsStats(
      shopDomain,
      from ? new Date(from) : null,
      to ? new Date(to) : null,
    );

    const payload = { ok: true as const, ...stats };

    if (isCloudflareKvEnabled() && fromIso && toIso) {
      void writeKvJson(analyticsKvKey(shopDomain, fromIso, toIso), payload, ANALYTICS_KV_TTL_SECONDS).catch(
        (error) => {
          console.error('[analytics-kv] write failed', shopDomain, error);
        },
      );
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    const message = getRequestErrorMessage(error, 'Failed to fetch analytics stats.');
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
