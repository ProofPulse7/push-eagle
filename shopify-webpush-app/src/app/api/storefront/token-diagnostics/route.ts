import { NextResponse } from 'next/server';
import { z } from 'zod';

import { env } from '@/lib/config/env';
import { verifyShopifyAppProxySignature } from '@/lib/integrations/shopify/verify';
import { recordStorefrontTokenDiagnostic } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const schema = z.object({
  shopDomain: z.string(),
  externalId: z.string().optional().nullable(),
  eventType: z.string().min(2),
  status: z.enum(['info', 'success', 'error']).optional(),
  reason: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
  tokenType: z.enum(['fcm', 'vapid']).optional().nullable(),
  browser: z.string().optional().nullable(),
  platform: z.string().optional().nullable(),
  locale: z.string().optional().nullable(),
  permissionState: z.string().optional().nullable(),
  endpoint: z.string().optional().nullable(),
  details: z.object({}).passthrough().optional().nullable(),
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

  return /^https:\/\/[a-z0-9.-]+$/i.test(origin);
};

const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || appOrigin || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Domain',
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

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(getCorsOrigin(origin)) });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  try {
    if (!isTrustedRequest(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized diagnostics request.' }, { status: 401, headers: buildCorsHeaders(getCorsOrigin(origin)) });
    }

    const url = new URL(request.url);
    const body = schema.parse(await request.json());
    const shopDomain = parseShopDomain(body.shopDomain);

    if (url.searchParams.has('shop')) {
      const proxiedShopDomain = parseShopDomain(url.searchParams.get('shop'));
      if (proxiedShopDomain !== shopDomain) {
        return NextResponse.json({ ok: false, error: 'Shop domain mismatch.' }, { status: 400, headers: buildCorsHeaders(getCorsOrigin(origin)) });
      }
    }

    await recordStorefrontTokenDiagnostic({
      shopDomain,
      externalId: body.externalId,
      eventType: body.eventType,
      status: body.status,
      reason: body.reason,
      message: body.message,
      tokenType: body.tokenType,
      browser: body.browser,
      platform: body.platform,
      locale: body.locale,
      permissionState: body.permissionState,
      endpoint: body.endpoint,
      details: body.details ?? null,
    });

    return NextResponse.json({ ok: true }, { headers: buildCorsHeaders(getCorsOrigin(origin)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to record diagnostics.';
    return NextResponse.json({ ok: false, error: message }, { status: 400, headers: buildCorsHeaders(getCorsOrigin(origin)) });
  }
}
