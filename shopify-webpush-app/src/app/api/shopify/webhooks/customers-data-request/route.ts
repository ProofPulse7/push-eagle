import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-shopify-hmac-sha256');

  if (!verifyShopifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
