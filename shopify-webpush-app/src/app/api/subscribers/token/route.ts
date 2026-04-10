import { createHash } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { upsertSubscriberToken } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const requestSchema = z.object({
  shopDomain: z.string().optional(),
  token: z.string().min(10),
  externalId: z.string().optional(),
  browser: z.string().optional(),
  platform: z.string().optional(),
  locale: z.string().optional(),
  country: z.string().optional(),
  userAgent: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const externalId = body.externalId?.trim()
      ? body.externalId.trim()
      : createHash('sha256').update(body.token).digest('hex').slice(0, 24);

    const saved = await upsertSubscriberToken({
      shopDomain,
      externalId,
      token: body.token,
      browser: body.browser,
      platform: body.platform,
      locale: body.locale,
      country: body.country,
      userAgent: body.userAgent,
    });

    return NextResponse.json({
      ok: true,
      shopDomain,
      subscriberId: saved.subscriberId,
      tokenId: saved.tokenId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to store subscriber token.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
