import { createHmac } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { env } from '@/lib/config/env';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const bodySchema = z.object({
  shopDomain: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);

    const rootUrl = env.SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app';
    const secret = env.SHOPIFY_DASHBOARD_SSO_SECRET || env.SHOPIFY_API_SECRET;
    if (!secret) {
      return NextResponse.json({ ok: false, error: 'Missing sync secret configuration.' }, { status: 500 });
    }

    const ts = Date.now();
    const signature = createHmac('sha256', secret).update(`${shopDomain}.${ts}`).digest('hex');

    const response = await fetch(new URL('/api/shopify/sync', rootUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Push-Eagle-Signature': signature,
      },
      body: JSON.stringify({
        shopDomain,
        ts,
      }),
    });

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const error =
        typeof parsed === 'object' && parsed && 'error' in parsed && typeof (parsed as { error?: unknown }).error === 'string'
          ? (parsed as { error: string }).error
          : `Sync failed (${response.status}).`;
      return NextResponse.json({ ok: false, error }, { status: response.status });
    }

    return NextResponse.json({ ok: true, shopDomain, result: parsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to trigger Shopify sync.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
