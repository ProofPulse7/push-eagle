import { createHash } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { resolveSubscriberGeo } from '@/lib/server/resolve-subscriber-geo';
import { upsertSubscriberToken } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const requestSchema = z.object({
  shopDomain: z.string().optional(),
  token: z.string().min(10),
  tokenType: z.enum(['fcm', 'vapid']).optional(),
  vapidEndpoint: z.string().url().optional(),
  vapidP256dh: z.string().optional(),
  vapidAuth: z.string().optional(),
  externalId: z.string().optional(),
  browser: z.string().optional(),
  platform: z.string().optional(),
  locale: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  userAgent: z.string().optional(),
});

import {
  detectBrowserFromUserAgent,
  detectPlatformFromUserAgent,
} from '@/lib/shared/browser-detection';

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const { country, city } = resolveSubscriberGeo(request, body);
    const userAgent = body.userAgent ?? request.headers.get('user-agent');
    const externalId = body.externalId?.trim()
      ? body.externalId.trim()
      : createHash('sha256').update(body.token).digest('hex').slice(0, 24);

    const saved = await upsertSubscriberToken({
      shopDomain,
      externalId,
      token: body.token,
      tokenType: body.tokenType,
      vapidEndpoint: body.vapidEndpoint,
      vapidP256dh: body.vapidP256dh,
      vapidAuth: body.vapidAuth,
      browser: body.browser ?? detectBrowserFromUserAgent(userAgent),
      platform: body.platform ?? detectPlatformFromUserAgent(userAgent),
      locale: body.locale,
      country,
      city,
      userAgent,
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
