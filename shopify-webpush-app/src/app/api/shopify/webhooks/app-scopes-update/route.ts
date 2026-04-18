import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { registerWebhookEvent, upsertMerchantProfile } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

type ScopesUpdatePayload = {
  current?: string[] | string | null;
  previous?: string[] | string | null;
  shop?: string | null;
  domain?: string | null;
  myshopify_domain?: string | null;
};

const normalizeScopes = (value: ScopesUpdatePayload['current']) => {
  if (Array.isArray(value)) {
    return value.map((scope) => String(scope).trim()).filter(Boolean).join(',');
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
      .join(',');
  }

  return '';
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-shopify-hmac-sha256');

    if (!verifyShopifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as ScopesUpdatePayload;
    const shopDomain = parseShopDomain(
      request.headers.get('x-shopify-shop-domain')
      ?? payload.myshopify_domain
      ?? payload.domain
      ?? payload.shop,
    );
    const eventId = request.headers.get('x-shopify-event-id');

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic: 'app/scopes_update',
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    await upsertMerchantProfile({
      shopDomain,
      myshopifyDomain: shopDomain,
      scopes: normalizeScopes(payload.current),
    });

    return NextResponse.json({ ok: true, shopDomain, scopes: normalizeScopes(payload.current) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process scopes update webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}