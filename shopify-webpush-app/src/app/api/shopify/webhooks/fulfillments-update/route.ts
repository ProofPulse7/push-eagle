import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { processFulfillmentUpdate, registerWebhookEvent } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

type ShopifyFulfillmentPayload = {
  id?: number | string;
  order_id?: number | string;
  status?: string | null;
  shipment_status?: string | null;
  tracking_company?: string | null;
  tracking_numbers?: string[] | null;
  tracking_urls?: string[] | null;
  updated_at?: string | null;
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-shopify-hmac-sha256');

    if (!verifyShopifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as ShopifyFulfillmentPayload;
    const shopDomain = parseShopDomain(request.headers.get('x-shopify-shop-domain'));
    const eventId = request.headers.get('x-shopify-event-id');

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic: 'fulfillments/update',
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    if (!payload.id || !payload.order_id) {
      return NextResponse.json({ ok: false, error: 'Missing fulfillment id or order id.' }, { status: 400 });
    }

    await processFulfillmentUpdate({
      shopDomain,
      fulfillmentId: String(payload.id),
      orderId: String(payload.order_id),
      status: payload.status ?? null,
      shipmentStatus: payload.shipment_status ?? null,
      trackingCompany: payload.tracking_company ?? null,
      trackingNumbers: Array.isArray(payload.tracking_numbers) ? payload.tracking_numbers : [],
      trackingUrls: Array.isArray(payload.tracking_urls) ? payload.tracking_urls : [],
      updatedAt: payload.updated_at ?? null,
    });

    return NextResponse.json({ ok: true, shopDomain });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process fulfillment webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}