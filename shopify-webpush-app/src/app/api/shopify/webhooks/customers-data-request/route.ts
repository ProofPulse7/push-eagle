import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { registerWebhookEvent } from '@/lib/server/data/store';
import { exportCustomerGdprData, storeGdprDataExport } from '@/lib/server/gdpr/compliance-data';
import { deliverGdprDataRequestExport } from '@/lib/server/gdpr/deliver-export';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-shopify-hmac-sha256');

    if (!verifyShopifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      shop_domain?: string;
      myshopify_domain?: string;
      customer?: {
        id?: number | string;
        email?: string | null;
        phone?: string | null;
      };
      orders_requested?: Array<number | string>;
    };

    const shopDomain = parseShopDomain(payload.myshopify_domain ?? payload.shop_domain);
    const eventId = req.headers.get('x-shopify-event-id');

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic: 'customers/data_request',
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    const ordersRequested = (payload.orders_requested ?? []).map((value) => String(value));
    const exportPayload = await exportCustomerGdprData(
      shopDomain,
      payload.customer ?? {},
      ordersRequested,
    );

    const stored = await storeGdprDataExport({
      shopDomain,
      customer: payload.customer ?? {},
      payload: exportPayload,
    });

    const delivery = await deliverGdprDataRequestExport({
      shopDomain,
      exportId: stored.exportId,
      customer: payload.customer ?? {},
      payload: exportPayload,
    });

    console.info('[gdpr] customers/data_request export stored', {
      shopDomain,
      exportId: stored.exportId,
      customerId: payload.customer?.id ?? null,
      delivered: delivery.delivered,
      recipient: 'recipient' in delivery ? delivery.recipient : null,
      recordCounts: {
        shopifyCustomers: exportPayload.shopifyCustomers.length,
        subscribers: exportPayload.subscribers.length,
        orders: exportPayload.orders.length,
      },
    });

    return NextResponse.json({
      ok: true,
      shopDomain,
      exported: true,
      exportId: stored.exportId,
      delivered: delivery.delivered,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to process customers/data_request webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
