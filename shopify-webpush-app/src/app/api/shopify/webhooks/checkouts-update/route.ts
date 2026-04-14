import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { recordSubscriberActivity, registerWebhookEvent } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';
import { getCustomerExternalId } from '@/lib/server/storefront-identity';

export const runtime = 'nodejs';

type ShopifyCheckoutPayload = {
  id?: number | string;
  token?: string | null;
  abandoned_checkout_url?: string | null;
  updated_at?: string | null;
  email?: string | null;
  customer?: {
    id?: number | string | null;
    email?: string | null;
  } | null;
  note_attributes?: Array<{ name?: string | null; value?: string | null }>;
  line_items?: Array<{
    product_id?: number | string | null;
    variant_id?: number | string | null;
    quantity?: number | null;
    url?: string | null;
  }>;
};

const getExternalIdFromNoteAttributes = (noteAttributes?: Array<{ name?: string | null; value?: string | null }>) => {
  if (!Array.isArray(noteAttributes)) {
    return null;
  }

  const keys = new Set(['push_eagle_external_id', 'pe_external_id', '_push_eagle_external_id']);
  for (const pair of noteAttributes) {
    const key = String(pair?.name ?? '').trim().toLowerCase();
    if (keys.has(key)) {
      const value = String(pair?.value ?? '').trim();
      if (value) {
        return value;
      }
    }
  }

  return null;
};

const deriveCartExternalId = (shopDomain: string, token?: string | null) => {
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

    const payload = JSON.parse(rawBody) as ShopifyCheckoutPayload;
    const shopDomain = parseShopDomain(request.headers.get('x-shopify-shop-domain'));
    const eventId = request.headers.get('x-shopify-event-id');
    const topic = request.headers.get('x-shopify-topic') || 'checkouts/update';

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic,
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    const externalIdFromNotes = getExternalIdFromNoteAttributes(payload.note_attributes);
    const identityExternalId = getCustomerExternalId({
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      email: payload.customer?.email ?? payload.email ?? null,
    });
    const externalId = externalIdFromNotes ?? identityExternalId ?? deriveCartExternalId(shopDomain, payload.token ?? null);

    if (!externalId) {
      return NextResponse.json({ ok: true, shopDomain, skipped: 'missing-external-id' });
    }

    const firstLineItem = (payload.line_items ?? [])[0];
    await recordSubscriberActivity({
      shopDomain,
      externalId,
      eventType: 'checkout_start',
      pageUrl: payload.abandoned_checkout_url ?? firstLineItem?.url ?? '/checkout',
      productId: firstLineItem?.product_id ? String(firstLineItem.product_id) : null,
      cartToken: payload.token ?? null,
      metadata: {
        checkoutId: payload.id ? String(payload.id) : null,
        variantId: firstLineItem?.variant_id ? String(firstLineItem.variant_id) : null,
        quantity: firstLineItem?.quantity ?? null,
        updatedAt: payload.updated_at ?? null,
        sourceTopic: topic,
      },
    });

    return NextResponse.json({ ok: true, shopDomain });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process checkouts webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}