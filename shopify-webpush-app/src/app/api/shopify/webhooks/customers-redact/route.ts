import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { registerWebhookEvent } from '@/lib/server/data/store';
import { redactCustomerGdprData } from '@/lib/server/gdpr/compliance-data';
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
      orders_to_redact?: Array<number | string>;
    };

    const shopDomain = parseShopDomain(payload.myshopify_domain ?? payload.shop_domain);
    const eventId = req.headers.get('x-shopify-event-id');

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic: 'customers/redact',
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    const ordersToRedact = (payload.orders_to_redact ?? []).map((value) => String(value));
    const result = await redactCustomerGdprData(shopDomain, payload.customer ?? {}, ordersToRedact);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process customers/redact webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
