import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { recordAttributedConversion, registerWebhookEvent, upsertShopifyCustomer } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';
import { getCustomerExternalId } from '@/lib/server/storefront-identity';

export const runtime = 'nodejs';

type ShopifyOrderPayload = {
  id?: number | string;
  order_number?: number;
  total_price?: string;
  created_at?: string;
  landing_site?: string | null;
  customer?: {
    id?: number | string | null;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-shopify-hmac-sha256');

    if (!verifyShopifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as ShopifyOrderPayload;
    const shopDomain = parseShopDomain(request.headers.get('x-shopify-shop-domain'));
    const eventId = request.headers.get('x-shopify-event-id');

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic: 'orders/create',
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    const externalId = getCustomerExternalId({
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      email: payload.customer?.email ?? null,
    });

    await upsertShopifyCustomer({
      shopDomain,
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      email: payload.customer?.email ?? null,
      firstName: payload.customer?.first_name ?? null,
      lastName: payload.customer?.last_name ?? null,
    });

    let campaignId: string | null = null;
    if (payload.landing_site) {
      try {
        const landingUrl = new URL(payload.landing_site);
        campaignId = landingUrl.searchParams.get('utm_campaign');
      } catch {
        campaignId = null;
      }
    }

    const revenue = Number(payload.total_price ?? 0);
    const result = await recordAttributedConversion({
      shopDomain,
      orderId: String(payload.id ?? payload.order_number ?? `shopify-${Date.now()}`),
      revenueCents: Math.round(revenue * 100),
      occurredAt: payload.created_at ?? null,
      externalId,
      campaignId,
    });

    return NextResponse.json({ ok: true, shopDomain, attributed: result.attributed, campaignId: result.campaignId ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process order webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
