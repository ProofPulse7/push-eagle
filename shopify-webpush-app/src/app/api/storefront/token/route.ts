import { createHash } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { env } from '@/lib/config/env';
import { resolveSubscriberGeo } from '@/lib/server/resolve-subscriber-geo';
import { upsertSubscriberToken } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';
import { verifyStorefrontRequest } from '@/lib/server/storefront-request-auth';

export const runtime = 'nodejs';

const schema = z.object({
  shopDomain: z.string(),
  token: z.string().min(10),
  tokenType: z.enum(['fcm', 'vapid']).optional(),
  vapidEndpoint: z.string().url().optional().nullable(),
  vapidP256dh: z.string().optional().nullable(),
  vapidAuth: z.string().optional().nullable(),
  externalId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  browser: z.string().optional().nullable(),
  platform: z.string().optional().nullable(),
  locale: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  region: z.string().optional().nullable(),
  deviceContext: z.object({}).passthrough().optional().nullable(),
});

const appOrigin = (() => {
  try {
    return new URL(env.NEXT_PUBLIC_APP_URL).origin;
  } catch (_error) {
    return '';
  }
})();

const isTrustedRequest = async (request: Request, shopDomain: string) => {
  const auth = await verifyStorefrontRequest(request, shopDomain);
  return auth.ok;
};

const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || appOrigin || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Domain',
  'Access-Control-Allow-Credentials': 'true',
  Vary: 'Origin',
});

const getCorsOrigin = (origin: string | null) => {
  if (!origin) {
    return appOrigin || '*';
  }

  if (appOrigin && origin === appOrigin) {
    return origin;
  }

  if (/^https:\/\/[a-z0-9.-]+$/i.test(origin)) {
    return origin;
  }

  return appOrigin || '*';
};

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

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(getCorsOrigin(origin)) });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    const body = schema.parse(await request.json());
    const shopDomain = parseShopDomain(body.shopDomain);

    if (!(await isTrustedRequest(request, shopDomain))) {
      return NextResponse.json({ ok: false, error: 'Unauthorized token registration request.' }, { status: 401, headers: buildCorsHeaders(getCorsOrigin(origin)) });
    }

    const url = new URL(request.url);

    if (url.searchParams.has('shop')) {
      const proxiedShopDomain = parseShopDomain(url.searchParams.get('shop'));
      if (proxiedShopDomain !== shopDomain) {
        return NextResponse.json({ ok: false, error: 'Shop domain mismatch.' }, { status: 400, headers: buildCorsHeaders(getCorsOrigin(origin)) });
      }
    }

    const userAgent = request.headers.get('user-agent');
    const { country, city, region } = resolveSubscriberGeo(request, {
      country: body.country,
      city: body.city,
      region: body.region,
      locale: body.locale,
      deviceContext: body.deviceContext,
    });
    const externalId = body.externalId?.trim()
      ? body.externalId.trim()
      : createHash('sha256').update(`${shopDomain}:${body.token}`).digest('hex').slice(0, 24);
    const clientId = body.clientId?.trim() ? body.clientId.trim() : null;

    const browser = body.browser
      ?? (typeof body.deviceContext?.browserName === 'string' ? body.deviceContext.browserName : undefined)
      ?? detectBrowserFromUserAgent(userAgent);
    const platform = body.platform
      ?? (typeof body.deviceContext?.osName === 'string' ? body.deviceContext.osName : undefined)
      ?? detectPlatformFromUserAgent(userAgent);
    const locale = body.locale
      ?? (typeof body.deviceContext?.language === 'string' ? body.deviceContext.language : undefined)
      ?? (typeof body.deviceContext?.shopifyLocale === 'string' ? body.deviceContext.shopifyLocale : undefined);

    const enrichedDeviceContext = {
      ...(body.deviceContext ?? {}),
      clientId,
      country: country ?? (typeof body.deviceContext?.country === 'string' ? body.deviceContext.country : null),
      city: city ?? (typeof body.deviceContext?.city === 'string' ? body.deviceContext.city : null),
      region: region ?? (typeof body.deviceContext?.region === 'string' ? body.deviceContext.region : null),
    };

    const saved = await upsertSubscriberToken({
      shopDomain,
      externalId,
      token: body.token,
      tokenType: body.tokenType,
      vapidEndpoint: body.vapidEndpoint,
      vapidP256dh: body.vapidP256dh,
      vapidAuth: body.vapidAuth,
      browser,
      platform,
      locale,
      country,
      city,
      userAgent,
      deviceContext: enrichedDeviceContext,
    });

    return NextResponse.json(
      {
        ok: true,
        shopDomain,
        subscriberId: saved.subscriberId,
        tokenId: saved.tokenId,
      },
      { headers: buildCorsHeaders(getCorsOrigin(origin)) },
    );
  } catch (error) {
    const origin = request.headers.get('origin');
    const message = error instanceof Error ? error.message : 'Failed to register storefront token.';
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: buildCorsHeaders(getCorsOrigin(origin)) });
  }
}
