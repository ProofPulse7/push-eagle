import { createHash } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enqueueIngestionJob, processIngestionJob } from '@/lib/server/data/store';
import { extractShopDomain, parseShopDomain } from '@/lib/server/shop-context';
import { verifyStorefrontRequest } from '@/lib/server/storefront-request-auth';

export const runtime = 'nodejs';

const schema = z.object({
  shopDomain: z.string().optional(),
  externalId: z.string().min(6).optional(),
  clientId: z.string().optional().nullable(),
  eventName: z.string().optional(),
  eventType: z.enum(['page_view', 'product_view', 'add_to_cart', 'checkout_start', 'checkout_complete']),
  pageUrl: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  cartToken: z.string().optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
});

const buildCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Shop-Domain',
  Vary: 'Origin',
});

const getRequestIp = (request: Request) => {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  return request.headers.get('x-real-ip')?.trim() || null;
};

const deriveExternalId = (shopDomain: string, body: z.infer<typeof schema>) => {
  const explicit = body.externalId ? String(body.externalId).trim() : null;
  if (explicit) {
    return explicit;
  }

  const cartToken = body.cartToken ? String(body.cartToken).trim() : null;
  if (cartToken) {
    return `cart:${shopDomain}:${cartToken}`;
  }

  const clientId = body.clientId ? String(body.clientId).trim() : null;
  if (clientId) {
    return `px:${shopDomain}:${clientId}`;
  }

  return null;
};

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');

  try {
    const url = new URL(request.url);
    const body = schema.parse(await request.json());
    const shopDomain = body.shopDomain ? parseShopDomain(body.shopDomain) : extractShopDomain(request);

    const auth = await verifyStorefrontRequest(request, shopDomain);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized pixel event request.' },
        { status: 401, headers: buildCorsHeaders(origin) },
      );
    }

    const externalId = deriveExternalId(shopDomain, body);
    if (!externalId) {
      return NextResponse.json(
        { ok: false, error: 'Unable to derive externalId from pixel payload.' },
        { status: 400, headers: buildCorsHeaders(origin) },
      );
    }

    const requestUserAgent = request.headers.get('user-agent')?.trim() || null;
    const requestIp = getRequestIp(request);

    const payload = {
      shopDomain,
      externalId,
      eventType: body.eventType,
      pageUrl: body.pageUrl,
      productId: body.productId,
      cartToken: body.cartToken,
      clientId: body.clientId,
      metadata: {
        ...(body.metadata ?? {}),
        pixelEventName: body.eventName ?? null,
        requestUserAgent,
        requestIp,
      },
    };

    const dedupeKey = createHash('sha256')
      .update(`${shopDomain}:${externalId}:${body.eventType}:${body.pageUrl ?? ''}:${body.productId ?? ''}:${body.cartToken ?? ''}`)
      .digest('hex');

    const jobId = await enqueueIngestionJob({
      shopDomain,
      jobType: 'pixel_event',
      payload,
      dedupeKey,
    });

    if (!jobId) {
      return NextResponse.json({ ok: true, queued: false, duplicate: true }, { headers: buildCorsHeaders(origin) });
    }

    if (url.searchParams.get('sync') === '1') {
      const processed = await processIngestionJob(jobId);
      return NextResponse.json({ ok: true, queued: true, sync: true, jobId, ...processed }, { headers: buildCorsHeaders(origin) });
    }

    return NextResponse.json({ ok: true, queued: true, jobId }, { headers: buildCorsHeaders(origin) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to ingest web pixel event.';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: buildCorsHeaders(origin) },
    );
  }
}
