import { NextResponse } from 'next/server';

import { getNeonSql } from '@/lib/integrations/database/neon';
import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { enqueueIngestionJob, processIngestionJob, registerWebhookEvent } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';
import { getCustomerExternalId } from '@/lib/server/storefront-identity';

export const runtime = 'nodejs';

type ShopifyOrderPayload = {
  id?: number | string;
  order_number?: number;
  total_price?: string;
  created_at?: string;
  landing_site?: string | null;
  customer?: {
    id?: number | string | null;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    tags?: string | null;
  } | null;
  line_items?: Array<{
    product_id?: number | string | null;
    title?: string | null;
    product_type?: string | null;
    vendor?: string | null;
  }>;
  client_details?: {
    browser_ip?: string | null;
    user_agent?: string | null;
    browser_width?: number | null;
    browser_height?: number | null;
  } | null;
  browser_ip?: string | null;
  cart_token?: string | null;
  checkout_token?: string | null;
  note_attributes?: Array<{ name?: string | null; value?: string | null }>;
};

const getExternalIdFromNoteAttributes = (noteAttributes?: Array<{ name?: string | null; value?: string | null }>) => {
  if (!Array.isArray(noteAttributes)) {
    return null;
  }

  const keys = new Set(['push_eagle_external_id', 'pe_external_id', '_push_eagle_external_id']);
  for (const pair of noteAttributes) {
    const key = String(pair?.name ?? '').trim().toLowerCase();
    if (keys.has(key)) {
      const value = String(pair?.value ?? '').trim();
      if (value) {
        return value;
      }
    }
  }

  return null;
};

const getCartTokenFromNoteAttributes = (noteAttributes?: Array<{ name?: string | null; value?: string | null }>) => {
  if (!Array.isArray(noteAttributes)) {
    return null;
  }

  const keys = new Set(['cart_token', 'carttoken', '_shopify_cart_token', 'checkout_token']);
  for (const pair of noteAttributes) {
    const key = String(pair?.name ?? '').trim().toLowerCase();
    if (!keys.has(key)) {
      continue;
    }
    const value = String(pair?.value ?? '').trim();
    if (value) {
      return value;
    }
  }

  return null;
};

const getClientIdFromNoteAttributes = (noteAttributes?: Array<{ name?: string | null; value?: string | null }>) => {
  if (!Array.isArray(noteAttributes)) {
    return null;
  }

  const keys = new Set(['push_eagle_client_id', 'pe_client_id', '_push_eagle_client_id']);
  for (const pair of noteAttributes) {
    const key = String(pair?.name ?? '').trim().toLowerCase();
    if (!keys.has(key)) {
      continue;
    }
    const value = String(pair?.value ?? '').trim();
    if (value) {
      return value;
    }
  }

  return null;
};

const findExternalIdByCartToken = async (shopDomain: string, cartToken?: string | null) => {
  const normalizedToken = String(cartToken ?? '').trim();
  if (!normalizedToken) {
    return null;
  }

  const sql = getNeonSql();
  const rows = await sql`
    WITH cart_related AS (
      SELECT
        external_id,
        created_at,
        COALESCE(metadata ->> 'clientId', '') AS client_id
      FROM subscriber_activity_events
      WHERE shop_domain = ${shopDomain}
        AND cart_token = ${normalizedToken}
        AND external_id IS NOT NULL
        AND external_id <> ''
        AND created_at >= NOW() - INTERVAL '30 days'

      UNION ALL

      SELECT
        external_id,
        created_at,
        COALESCE(client_id, '') AS client_id
      FROM pixel_events
      WHERE shop_domain = ${shopDomain}
        AND cart_token = ${normalizedToken}
        AND external_id IS NOT NULL
        AND external_id <> ''
        AND created_at >= NOW() - INTERVAL '30 days'
    ),
    stitched AS (
      SELECT external_id, created_at
      FROM cart_related

      UNION ALL

      SELECT e.external_id, e.created_at
      FROM subscriber_activity_events e
      WHERE e.shop_domain = ${shopDomain}
        AND e.external_id IS NOT NULL
        AND e.external_id <> ''
        AND e.created_at >= NOW() - INTERVAL '30 days'
        AND COALESCE(e.metadata ->> 'clientId', '') = ANY(
          ARRAY(SELECT DISTINCT client_id FROM cart_related WHERE client_id <> '')
        )

      UNION ALL

      SELECT p.external_id, p.created_at
      FROM pixel_events p
      WHERE p.shop_domain = ${shopDomain}
        AND p.external_id IS NOT NULL
        AND p.external_id <> ''
        AND p.created_at >= NOW() - INTERVAL '30 days'
        AND COALESCE(p.client_id, '') = ANY(
          ARRAY(SELECT DISTINCT client_id FROM cart_related WHERE client_id <> '')
        )
    )
    SELECT external_id
    FROM stitched
    ORDER BY
      CASE
        WHEN external_id LIKE 'anon:%' THEN 0
        WHEN external_id LIKE 'shopify_customer:%' THEN 1
        WHEN external_id LIKE 'email:%' THEN 2
        WHEN external_id LIKE 'cart:%' THEN 3
        WHEN external_id LIKE 'px:%' THEN 4
        ELSE 5
      END,
      created_at DESC
    LIMIT 1
  `;

  return rows[0]?.external_id ? String(rows[0].external_id) : null;
};

const findExternalIdByFingerprint = async (
  shopDomain: string,
  browserIp?: string | null,
  userAgent?: string | null,
) => {
  const ip = String(browserIp ?? '').trim();
  const ua = String(userAgent ?? '').trim();
  if (!ip || !ua) {
    return null;
  }

  const sql = getNeonSql();
  const rows = await sql`
    WITH recent_touch AS (
      SELECT external_id, created_at
      FROM pixel_events
      WHERE shop_domain = ${shopDomain}
        AND COALESCE(metadata ->> 'requestIp', '') = ${ip}
        AND COALESCE(metadata ->> 'requestUserAgent', '') = ${ua}
        AND created_at >= NOW() - INTERVAL '7 days'

      UNION ALL

      SELECT external_id, created_at
      FROM subscriber_activity_events
      WHERE shop_domain = ${shopDomain}
        AND COALESCE(metadata ->> 'requestIp', '') = ${ip}
        AND COALESCE(metadata ->> 'requestUserAgent', '') = ${ua}
        AND created_at >= NOW() - INTERVAL '7 days'
    )
    SELECT external_id
    FROM recent_touch
    WHERE external_id IS NOT NULL
      AND external_id <> ''
      AND (
        external_id LIKE 'anon:%'
        OR external_id LIKE 'cart:%'
        OR external_id LIKE 'px:%'
      )
    ORDER BY
      CASE
        WHEN external_id LIKE 'anon:%' THEN 0
        WHEN external_id LIKE 'cart:%' THEN 1
        WHEN external_id LIKE 'px:%' THEN 2
        ELSE 3
      END,
      created_at DESC
    LIMIT 1
  `;

  return rows[0]?.external_id ? String(rows[0].external_id) : null;
};

const normalizeCustomerTags = (tags?: string | null) => {
  if (!tags) {
    return null;
  }

  const normalized = tags
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return normalized.length ? normalized : null;
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-shopify-hmac-sha256');

    if (!verifyShopifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as ShopifyOrderPayload;
    const shopDomain = parseShopDomain(request.headers.get('x-shopify-shop-domain'));
    const eventId = request.headers.get('x-shopify-event-id');

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic: 'orders/create',
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    const externalIdFromNotes = getExternalIdFromNoteAttributes(payload.note_attributes);
    const cartTokenFromNotes = getCartTokenFromNoteAttributes(payload.note_attributes);
    const cartToken = cartTokenFromNotes ?? payload.checkout_token ?? payload.cart_token ?? null;
    const clientIdFromNotes = getClientIdFromNoteAttributes(payload.note_attributes);
    const browserIp = payload.client_details?.browser_ip ?? payload.browser_ip ?? null;
    const userAgent = payload.client_details?.user_agent ?? request.headers.get('user-agent');
    const externalIdFromCartToken = await findExternalIdByCartToken(shopDomain, cartToken);
    const externalIdFromFingerprint = await findExternalIdByFingerprint(shopDomain, browserIp, userAgent);
    const customerExternalId = getCustomerExternalId({
      customerId: payload.customer?.id ? String(payload.customer.id) : null,
      email: payload.customer?.email ?? null,
    });
    const externalId = externalIdFromNotes ?? externalIdFromCartToken ?? externalIdFromFingerprint ?? customerExternalId;

    const orderId = String(payload.id ?? payload.order_number ?? `shopify-${Date.now()}`);
    const totalPriceCents = Math.round(Number(payload.total_price ?? 0) * 100);
    const dedupeKey = eventId ? `orders-create:${eventId}` : `orders-create:${shopDomain}:${orderId}`;

    const jobId = await enqueueIngestionJob({
      shopDomain,
      jobType: 'shopify_order_create',
      dedupeKey,
      payload: {
        shopDomain,
        orderId,
        externalId,
        cartToken,
        clientId: clientIdFromNotes,
        customerId: payload.customer?.id ? String(payload.customer.id) : null,
        email: payload.customer?.email ?? null,
        firstName: payload.customer?.first_name ?? null,
        lastName: payload.customer?.last_name ?? null,
        customerTags: normalizeCustomerTags(payload.customer?.tags),
        totalPriceCents,
        createdAt: payload.created_at ?? null,
        lineItems: (payload.line_items ?? []).map((item) => ({
          productId: item.product_id ? String(item.product_id) : null,
          productTitle: item.title ?? null,
          collectionHint: item.product_type ?? item.vendor ?? null,
        })),
        landingSite: payload.landing_site ?? null,
        browserIp,
        userAgent,
      },
    });

    let processedNow = false;
    let processingError: string | null = null;

    if (jobId) {
      const processResult = await processIngestionJob(jobId);
      processedNow = Boolean(processResult.processed);
      processingError = processResult.error ?? null;
    }

    return NextResponse.json({
      ok: true,
      shopDomain,
      queued: true,
      jobId,
      processedNow,
      processingError,
      cartToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process order webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
