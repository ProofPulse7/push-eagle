import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordSubscriberActivity } from '@/lib/server/data/store';
import { shouldCollectEventType } from '@/lib/server/automation/collection-gate';
import { parseShopDomain } from '@/lib/server/shop-context';
import { shouldRunStorefrontAutomationInline } from '@/lib/server/storefront-automation-inline';
import {
  isLowValueStorefrontActivityEvent,
  shouldThrottleStorefrontEvent,
} from '@/lib/server/storefront-event-throttle';
import { verifyStorefrontRequest } from '@/lib/server/storefront-request-auth';

export const runtime = 'nodejs';

const schema = z.object({
  shopDomain: z.string(),
  externalId: z.string().min(6),
  eventType: z.enum(['page_view', 'product_view', 'add_to_cart', 'checkout_start']),
  pageUrl: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  cartToken: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
});

const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Domain',
  Vary: 'Origin',
});

const THROTTLE_SECONDS: Record<string, number> = {
  page_view: 120,
  product_view: 300,
  add_to_cart: 45,
  checkout_start: 120,
};

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  try {
    const body = schema.parse(await request.json());
    const shopDomain = parseShopDomain(body.shopDomain);

    const auth = await verifyStorefrontRequest(request, shopDomain);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized storefront activity request.' },
        { status: 401, headers: buildCorsHeaders(origin) },
      );
    }

    if (isLowValueStorefrontActivityEvent(body.eventType)) {
      return NextResponse.json(
        { ok: true, skipped: true, reason: 'page_view_handled_by_pixel' },
        { headers: buildCorsHeaders(origin) },
      );
    }

    // Collection gate: only accept the raw event when the automation that
    // consumes it is active for this shop. Cheap (cached) and short-circuits
    // before any throttle write or DB work when the automation is off.
    if (!(await shouldCollectEventType(shopDomain, body.eventType))) {
      return NextResponse.json(
        { ok: true, skipped: true, reason: 'automation_inactive' },
        { headers: buildCorsHeaders(origin) },
      );
    }

    const throttleSeconds = THROTTLE_SECONDS[body.eventType] ?? 60;
    const throttled = await shouldThrottleStorefrontEvent({
      shopDomain,
      externalId: body.externalId,
      eventType: body.eventType,
      productId: body.productId,
      cartToken: body.cartToken,
      pageUrl: body.pageUrl,
      windowSeconds: throttleSeconds,
    });

    if (throttled) {
      return NextResponse.json(
        { ok: true, skipped: true, reason: 'throttled' },
        { headers: buildCorsHeaders(origin) },
      );
    }

    const result = await recordSubscriberActivity({
      shopDomain,
      externalId: body.externalId,
      eventType: body.eventType,
      pageUrl: body.pageUrl,
      productId: body.productId,
      cartToken: body.cartToken,
      metadata: body.metadata,
    });

    if (shouldRunStorefrontAutomationInline()) {
      const { processDueAutomationJobsForShop } = await import('@/lib/server/data/store');
      void processDueAutomationJobsForShop(shopDomain, 20, 5).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, ...result }, { headers: buildCorsHeaders(origin) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record subscriber activity.';
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: buildCorsHeaders(origin) });
  }
}
