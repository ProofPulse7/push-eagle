import { createHash } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getRequestGeo } from '@/lib/server/request-geo';
import { upsertSubscriberToken, dispatchWelcomeJobNow } from '@/lib/server/data/store';
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

const detectBrowserFromUserAgent = (userAgent: string | null) => {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'unknown';
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('opr/') || ua.includes('opera')) return 'opera';
  if (ua.includes('samsungbrowser/')) return 'samsung';
  if (ua.includes('firefox/') || ua.includes('fxios/')) return 'firefox';
  if (ua.includes('chrome/') || ua.includes('crios/')) return 'chrome';
  if (ua.includes('safari/')) return 'safari';
  return 'unknown';
};

const detectPlatformFromUserAgent = (userAgent: string | null) => {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'unknown';
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod') || ua.includes('ios')) return 'ios';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
  if (ua.includes('cros')) return 'chromeos';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
};

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const requestGeo = getRequestGeo(request);
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
      country: body.country ?? requestGeo.country,
      city: body.city ?? requestGeo.city,
      userAgent,
    });

    // Fire welcome notification immediately (don't await — non-blocking)
    if (saved.tokenId) {
      dispatchWelcomeJobNow(shopDomain, saved.tokenId).catch(() => undefined);
    }

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
