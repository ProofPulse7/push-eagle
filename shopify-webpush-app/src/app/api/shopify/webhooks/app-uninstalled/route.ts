import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { markMerchantUninstalled, registerWebhookEvent } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-shopify-hmac-sha256');
    const isValid = verifyShopifyWebhookSignature(rawBody, signature);

    if (!isValid) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as { domain?: string; myshopify_domain?: string };
    const shopDomain = parseShopDomain(payload.myshopify_domain ?? payload.domain);
    const eventId = req.headers.get('x-shopify-event-id');

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic: 'app/uninstalled',
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    await markMerchantUninstalled(shopDomain);

    return NextResponse.json({ ok: true, shopDomain, preserved: true, uninstalled: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
