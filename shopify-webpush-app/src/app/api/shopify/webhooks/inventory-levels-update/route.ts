import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { processInventoryLevelUpdate, registerWebhookEvent } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

type ShopifyInventoryPayload = {
  inventory_item_id?: number | string;
  available?: number | null;
  updated_at?: string | null;
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-shopify-hmac-sha256');

    if (!verifyShopifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as ShopifyInventoryPayload;
    const shopDomain = parseShopDomain(request.headers.get('x-shopify-shop-domain'));
    const eventId = request.headers.get('x-shopify-event-id');

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic: 'inventory_levels/update',
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    if (!payload.inventory_item_id) {
      return NextResponse.json({ ok: false, error: 'Missing inventory item id.' }, { status: 400 });
    }

    await processInventoryLevelUpdate({
      shopDomain,
      inventoryItemId: String(payload.inventory_item_id),
      available: typeof payload.available === 'number' ? payload.available : null,
      updatedAt: payload.updated_at ?? null,
    });

    return NextResponse.json({ ok: true, shopDomain });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process inventory webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}