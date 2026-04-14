import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { recordSubscriberActivity, registerWebhookEvent } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

type ShopifyCartPayload = {
  id?: number | string;
  token?: string | null;
  updated_at?: string | null;
  line_items?: Array<{
    product_id?: number | string | null;
    variant_id?: number | string | null;
    quantity?: number | null;
    url?: string | null;
  }>;
};

const deriveExternalId = (shopDomain: string, token?: string | null) => {
  if (!token) {
    return null;
  }

  return `cart:${shopDomain}:${token}`;
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-shopify-hmac-sha256');

    if (!verifyShopifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as ShopifyCartPayload;
    const shopDomain = parseShopDomain(request.headers.get('x-shopify-shop-domain'));
    const eventId = request.headers.get('x-shopify-event-id');

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic: 'carts/update',
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    const externalId = deriveExternalId(shopDomain, payload.token ?? null);
    if (!externalId) {
      return NextResponse.json({ ok: true, shopDomain, skipped: 'missing-token' });
    }

    const firstLineItem = (payload.line_items ?? [])[0];
    await recordSubscriberActivity({
      shopDomain,
      externalId,
      eventType: 'add_to_cart',
      pageUrl: firstLineItem?.url ?? '/cart',
      productId: firstLineItem?.product_id ? String(firstLineItem.product_id) : null,
      cartToken: payload.token ?? null,
      metadata: {
        cartId: payload.id ? String(payload.id) : null,
        variantId: firstLineItem?.variant_id ? String(firstLineItem.variant_id) : null,
        quantity: firstLineItem?.quantity ?? null,
        updatedAt: payload.updated_at ?? null,
      },
    });

    return NextResponse.json({ ok: true, shopDomain });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process carts webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}