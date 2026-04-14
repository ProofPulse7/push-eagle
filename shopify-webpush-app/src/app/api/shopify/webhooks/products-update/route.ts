import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { registerWebhookEvent, upsertShopifyProductVariants } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

type ShopifyProductPayload = {
  id?: number | string;
  title?: string | null;
  handle?: string | null;
  updated_at?: string | null;
  image?: {
    src?: string | null;
  } | null;
  variants?: Array<{
    id?: number | string;
    title?: string | null;
    price?: string | null;
    compare_at_price?: string | null;
    inventory_item_id?: number | string | null;
  }>;
};

const toCents = (value?: string | null) => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-shopify-hmac-sha256');

    if (!verifyShopifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as ShopifyProductPayload;
    const shopDomain = parseShopDomain(request.headers.get('x-shopify-shop-domain'));
    const eventId = request.headers.get('x-shopify-event-id');

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic: 'products/update',
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    await upsertShopifyProductVariants({
      shopDomain,
      productId: String(payload.id ?? ''),
      productTitle: payload.title ?? null,
      handle: payload.handle ?? null,
      imageUrl: payload.image?.src ?? null,
      updatedAt: payload.updated_at ?? null,
      variants: (payload.variants ?? [])
        .filter((variant) => variant?.id != null)
        .map((variant) => ({
          variantId: String(variant.id),
          variantTitle: variant.title ?? null,
          priceCents: toCents(variant.price),
          compareAtPriceCents: toCents(variant.compare_at_price),
          inventoryItemId: variant.inventory_item_id ? String(variant.inventory_item_id) : null,
        })),
    });

    return NextResponse.json({ ok: true, shopDomain });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process product webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}