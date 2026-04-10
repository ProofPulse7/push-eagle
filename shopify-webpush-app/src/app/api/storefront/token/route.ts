import { createHash } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { upsertSubscriberToken } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const schema = z.object({
  shopDomain: z.string(),
  token: z.string().min(10),
  externalId: z.string().optional(),
  browser: z.string().optional(),
  platform: z.string().optional(),
  locale: z.string().optional(),
  country: z.string().optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Domain',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const shopDomain = parseShopDomain(body.shopDomain);

    const userAgent = request.headers.get('user-agent');
    const externalId = body.externalId?.trim()
      ? body.externalId.trim()
      : createHash('sha256').update(`${shopDomain}:${body.token}`).digest('hex').slice(0, 24);

    const browser = body.browser ?? (userAgent?.includes('Safari') ? 'safari' : userAgent?.includes('Firefox') ? 'firefox' : 'chrome');
    const platform = body.platform ?? (userAgent?.includes('Android') ? 'android' : userAgent?.includes('iPhone') ? 'ios' : 'desktop');

    const saved = await upsertSubscriberToken({
      shopDomain,
      externalId,
      token: body.token,
      browser,
      platform,
      locale: body.locale,
      country: body.country,
      userAgent,
    });

    return NextResponse.json(
      {
        ok: true,
        shopDomain,
        subscriberId: saved.subscriberId,
        tokenId: saved.tokenId,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to register storefront token.';
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: corsHeaders });
  }
}
