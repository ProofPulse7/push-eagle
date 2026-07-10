import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getStorefrontConfigCached } from '@/lib/server/cache/storefront-config-cache';
import { recordOptInPromptEvent } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';
import { verifyStorefrontRequest } from '@/lib/server/storefront-request-auth';

export const runtime = 'nodejs';

const schema = z.object({
  shopDomain: z.string(),
  externalId: z.string().min(6),
  promptType: z.enum(['browser', 'custom']),
  eventType: z.enum(['view', 'click']),
});

const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Domain',
  Vary: 'Origin',
});

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  try {
    const body = schema.parse(await request.json());
    const shopDomain = parseShopDomain(body.shopDomain);

    const auth = await verifyStorefrontRequest(request, shopDomain);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized storefront opt-in event request.' },
        { status: 401, headers: buildCorsHeaders(origin) },
      );
    }

    // KV-cached — avoids a Neon merchant_settings read on every prompt view/click.
    const { optIn: settings } = await getStorefrontConfigCached(shopDomain);
    if (settings.promptType === 'off') {
      return NextResponse.json({ ok: true, ignored: true }, { headers: buildCorsHeaders(origin) });
    }

    const activePromptType = settings.promptType === 'browser' ? 'browser' : 'custom';

    if (body.promptType !== activePromptType) {
      return NextResponse.json({ ok: true, ignored: true }, { headers: buildCorsHeaders(origin) });
    }

    await recordOptInPromptEvent({
      shopDomain,
      promptType: activePromptType,
      eventType: body.eventType,
    });

    return NextResponse.json({ ok: true }, { headers: buildCorsHeaders(origin) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record opt-in event.';
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: buildCorsHeaders(origin) });
  }
}
