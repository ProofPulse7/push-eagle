import { NextResponse } from 'next/server';
import { z } from 'zod';

import { recordPixelEvent } from '@/lib/server/automation/pixel-events';
import { recordSubscriberActivity } from '@/lib/server/data/store';
import { extractShopDomain, parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const schema = z.object({
  shopDomain: z.string().optional(),
  externalId: z.string().min(6).optional(),
  clientId: z.string().optional().nullable(),
  eventName: z.string().optional(),
  eventType: z.enum(['page_view', 'product_view', 'add_to_cart', 'checkout_start']),
  pageUrl: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  cartToken: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Domain',
};

const deriveExternalId = (shopDomain: string, body: z.infer<typeof schema>) => {
  const explicit = body.externalId ? String(body.externalId).trim() : null;
  if (explicit) {
    return explicit;
  }

  const cartToken = body.cartToken ? String(body.cartToken).trim() : null;
  if (cartToken) {
    return `cart:${shopDomain}:${cartToken}`;
  }

  const clientId = body.clientId ? String(body.clientId).trim() : null;
  if (clientId) {
    return `px:${shopDomain}:${clientId}`;
  }

  return null;
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const shopDomain = body.shopDomain ? parseShopDomain(body.shopDomain) : extractShopDomain(request);

    const externalId = deriveExternalId(shopDomain, body);
    if (!externalId) {
      return NextResponse.json(
        { ok: false, error: 'Unable to derive externalId from pixel payload.' },
        { status: 400, headers: corsHeaders },
      );
    }

    // 1. Record raw pixel event to database (write-optimized logging)
    const pixelEventId = await recordPixelEvent({
      shopDomain,
      externalId,
      eventType: body.eventType,
      pageUrl: body.pageUrl,
      productId: body.productId,
      cartToken: body.cartToken,
      clientId: body.clientId,
      metadata: {
        ...(body.metadata ?? {}),
        pixelEventName: body.eventName ?? null,
      },
    });

    // 2. Record subscriber activity and queue automations
    const result = await recordSubscriberActivity({
      shopDomain,
      externalId,
      eventType: body.eventType,
      pageUrl: body.pageUrl,
      productId: body.productId,
      cartToken: body.cartToken,
      metadata: {
        ...(body.metadata ?? {}),
        pixelEventName: body.eventName ?? null,
        pixelClientId: body.clientId ?? null,
        pixelEventId,
      },
    });

    return NextResponse.json({ ok: true, ...result }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to ingest web pixel event.';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: corsHeaders },
    );
  }
}
