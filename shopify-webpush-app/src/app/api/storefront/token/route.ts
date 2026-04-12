import { createHash } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { env } from '@/lib/config/env';
import { verifyShopifyAppProxySignature } from '@/lib/integrations/shopify/verify';
import { getRequestGeo } from '@/lib/server/request-geo';
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
  city: z.string().optional(),
  deviceContext: z.object({}).passthrough().optional(),
});

const appOrigin = (() => {
  try {
    return new URL(env.NEXT_PUBLIC_APP_URL).origin;
  } catch (_error) {
    return '';
  }
})();

const isTrustedRequest = (request: Request) => {
  const url = new URL(request.url);
  const hasProxySignature = url.searchParams.has('signature');

  if (hasProxySignature) {
    return verifyShopifyAppProxySignature(url.searchParams);
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    return false;
  }

  if (appOrigin && origin === appOrigin) {
    return true;
  }

  // Allow direct storefront fallback calls (custom domains and myshopify domains).
  return /^https:\/\/[a-z0-9.-]+$/i.test(origin);
};

const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || appOrigin || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Domain',
  Vary: 'Origin',
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(null) });
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (!isTrustedRequest(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized token registration request.' }, { status: 401, headers: buildCorsHeaders(origin) });
    }

    const url = new URL(request.url);
    const body = schema.parse(await request.json());
    const shopDomain = parseShopDomain(body.shopDomain);

    if (url.searchParams.has('shop')) {
      const proxiedShopDomain = parseShopDomain(url.searchParams.get('shop'));
      if (proxiedShopDomain !== shopDomain) {
        return NextResponse.json({ ok: false, error: 'Shop domain mismatch.' }, { status: 400, headers: buildCorsHeaders(origin) });
      }
    }

    const userAgent = request.headers.get('user-agent');
    const requestGeo = getRequestGeo(request);
    const externalId = body.externalId?.trim()
      ? body.externalId.trim()
      : createHash('sha256').update(`${shopDomain}:${body.token}`).digest('hex').slice(0, 24);

    const browser = body.browser
      ?? (typeof body.deviceContext?.browserName === 'string' ? body.deviceContext.browserName : undefined)
      ?? detectBrowserFromUserAgent(userAgent);
    const platform = body.platform
      ?? (typeof body.deviceContext?.osName === 'string' ? body.deviceContext.osName : undefined)
      ?? detectPlatformFromUserAgent(userAgent);
    const locale = body.locale
      ?? (typeof body.deviceContext?.language === 'string' ? body.deviceContext.language : undefined)
      ?? (typeof body.deviceContext?.shopifyLocale === 'string' ? body.deviceContext.shopifyLocale : undefined);
    const country = body.country
      ?? requestGeo.country
      ?? (typeof body.deviceContext?.shopifyCountry === 'string' ? body.deviceContext.shopifyCountry : undefined);
    const city = body.city
      ?? requestGeo.city;

    const saved = await upsertSubscriberToken({
      shopDomain,
      externalId,
      token: body.token,
      browser,
      platform,
      locale,
      country,
      city,
      userAgent,
      deviceContext: body.deviceContext ?? null,
    });

    return NextResponse.json(
      {
        ok: true,
        shopDomain,
        subscriberId: saved.subscriberId,
        tokenId: saved.tokenId,
      },
      { headers: buildCorsHeaders(origin) },
    );
  } catch (error) {
    const origin = request.headers.get('origin');
    const message = error instanceof Error ? error.message : 'Failed to register storefront token.';
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: buildCorsHeaders(origin) });
  }
}
