import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { recordAttributedConversion, registerWebhookEvent, upsertShopifyCustomer, upsertShopifyOrderEvent } from '@/lib/server/data/store';
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
    tags?: string | null;
  } | null;
  line_items?: Array<{
    product_id?: number | string | null;
    title?: string | null;
    product_type?: string | null;
    vendor?: string | null;
  }>;
  client_details?: {
    browser_ip?: string | null;
    user_agent?: string | null;
    browser_width?: number | null;
    browser_height?: number | null;
  } | null;
  browser_ip?: string | null;
  note_attributes?: Array<{ name?: string | null; value?: string | null }>;
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

const normalizeCustomerTags = (tags?: string | null) => {
  if (!tags) {
    return null;
  }

  const normalized = tags
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return normalized.length ? normalized : null;
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

    const externalIdFromNotes = getExternalIdFromNoteAttributes(payload.note_attributes);
    const externalId = externalIdFromNotes ?? getCustomerExternalId({
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      email: payload.customer?.email ?? null,
    });

    await upsertShopifyCustomer({
      shopDomain,
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      email: payload.customer?.email ?? null,
      firstName: payload.customer?.first_name ?? null,
      lastName: payload.customer?.last_name ?? null,
      externalId,
      tags: normalizeCustomerTags(payload.customer?.tags),
    });

    await upsertShopifyOrderEvent({
      shopDomain,
      orderId: String(payload.id ?? payload.order_number ?? `shopify-${Date.now()}`),
      externalId,
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      email: payload.customer?.email ?? null,
      totalPriceCents: Math.round(Number(payload.total_price ?? 0) * 100),
      createdAt: payload.created_at ?? null,
      lineItems: (payload.line_items ?? []).map((item) => ({
        productId: item.product_id ? String(item.product_id) : null,
        productTitle: item.title ?? null,
        collectionHint: item.product_type ?? item.vendor ?? null,
      })),
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
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      email: payload.customer?.email ?? null,
      campaignId,
      userAgent: payload.client_details?.user_agent ?? request.headers.get('user-agent'),
      browser: payload.client_details?.user_agent ?? null,
      country: null,
    });

    return NextResponse.json({ ok: true, shopDomain, attributed: result.attributed, campaignId: result.campaignId ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process order webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
