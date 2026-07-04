import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  analyticsKvKey,
  isCloudflareKvEnabled,
  readKvJson,
  writeKvJson,
} from '@/lib/server/cache/cloudflare-kv';
import { canAccessAnalytics } from '@/lib/server/billing/plan-access';
import { getMerchantBillingFast } from '@/lib/server/billing/merchant-billing';
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
    const billing = await getMerchantBillingFast(shopDomain);
    if (!canAccessAnalytics(billing.planKey)) {
      return NextResponse.json(
        { ok: false, error: 'Analytics is available on paid plans only.', locked: true },
        { status: 403 },
      );
    }

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

    // Treat an absent or explicit 'all' bound as null so getAnalyticsStats takes its
    // durable all-time path (which folds in the archived automation baseline) instead
    // of parsing an Invalid Date.
    const fromParam = from && from !== 'all' ? new Date(from) : null;
    const toParam = to && to !== 'all' ? new Date(to) : null;

    const stats = await getAnalyticsStats(shopDomain, fromParam, toParam);

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
