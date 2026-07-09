import { NextResponse } from 'next/server';

import { getNeonSql } from '@/lib/integrations/database/neon';
import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { deferAfterResponse } from '@/lib/server/defer-after-response';
import { recordSubscriberActivity, registerWebhookEvent } from '@/lib/server/data/store';
import { shouldCollectEventType } from '@/lib/server/automation/collection-gate';
import { isD1EventsEnabled } from '@/lib/server/integrations/d1-events';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

type ShopifyCartPayload = {
  id?: number | string;
  token?: string | null;
  updated_at?: string | null;
  attributes?: Record<string, unknown> | Array<{ key?: string | null; name?: string | null; value?: string | null }> | null;
  note_attributes?: Record<string, unknown> | Array<{ key?: string | null; name?: string | null; value?: string | null }> | null;
  line_items?: Array<{
    product_id?: number | string | null;
    variant_id?: number | string | null;
    quantity?: number | null;
    url?: string | null;
  }>;
};

const deriveExternalId = (shopDomain: string, token?: string | null) => {
  if (!token) {
    return null;
  }

  return `cart:${shopDomain}:${token}`;
};

const getCartAttribute = (payload: ShopifyCartPayload, key: string) => {
  const pools = [payload.attributes, payload.note_attributes];

  for (let idx = 0; idx < pools.length; idx += 1) {
    const attributes = pools[idx];
    if (!attributes) {
      continue;
    }

    if (Array.isArray(attributes)) {
      const row = attributes.find((item) => (item?.key ?? item?.name) === key);
      const value = row?.value == null ? '' : String(row.value).trim();
      if (value) {
        return value;
      }
      continue;
    }

    const raw = (attributes as Record<string, unknown>)[key];
    const value = raw == null ? '' : String(raw).trim();
    if (value) {
      return value;
    }
  }

  return null;
};

const resolveIdentityFromCartSignals = async (shopDomain: string, token?: string | null) => {
  const normalizedToken = token ? String(token).trim() : '';
  if (!normalizedToken) {
    return {
      externalId: null as string | null,
      clientId: null as string | null,
    };
  }

  // When raw events live on Cloudflare D1, stitch identity from D1 tracking rows
  // instead of the legacy Neon pixel/activity tables.
  if (isD1EventsEnabled()) {
    const { queryD1TrackingRowsForAutomation } = await import('@/lib/server/integrations/d1-events');
    const windowStartIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await queryD1TrackingRowsForAutomation({
      shopDomain,
      cartToken: normalizedToken,
      windowStartIso,
    });

    if (rows.length === 0) {
      return {
        externalId: null as string | null,
        clientId: null as string | null,
      };
    }

    const sorted = [...rows].sort((left, right) => right.created_at.localeCompare(left.created_at));
    const preferred = sorted.find((row) => {
      const externalId = String(row.external_id ?? '').trim();
      return externalId.length > 0 && !externalId.startsWith(`cart:${shopDomain}:`);
    }) ?? sorted[0];

    return {
      externalId: preferred?.external_id ? String(preferred.external_id).trim() : null,
      clientId: preferred?.client_id ? String(preferred.client_id).trim() : null,
    };
  }

  const sql = getNeonSql();
  const rows = await sql`
    WITH cart_related AS (
      SELECT
        external_id,
        created_at,
        COALESCE(metadata ->> 'clientId', metadata ->> 'shopifyAnalyticsClientId', '') AS client_id
      FROM subscriber_activity_events
      WHERE shop_domain = ${shopDomain}
        AND cart_token = ${normalizedToken}
        AND created_at >= NOW() - INTERVAL '14 days'

      UNION ALL

      SELECT
        external_id,
        created_at,
        COALESCE(client_id, '') AS client_id
      FROM pixel_events
      WHERE shop_domain = ${shopDomain}
        AND cart_token = ${normalizedToken}
        AND created_at >= NOW() - INTERVAL '14 days'
    ),
    stitched AS (
      SELECT external_id, created_at, client_id
      FROM cart_related

      UNION ALL

      SELECT
        e.external_id,
        e.created_at,
        COALESCE(e.metadata ->> 'clientId', e.metadata ->> 'shopifyAnalyticsClientId', '') AS client_id
      FROM subscriber_activity_events e
      WHERE e.shop_domain = ${shopDomain}
        AND e.created_at >= NOW() - INTERVAL '14 days'
        AND COALESCE(e.metadata ->> 'clientId', e.metadata ->> 'shopifyAnalyticsClientId', '') = ANY(
          ARRAY(SELECT DISTINCT client_id FROM cart_related WHERE client_id <> '')
        )

      UNION ALL

      SELECT
        p.external_id,
        p.created_at,
        COALESCE(p.client_id, '') AS client_id
      FROM pixel_events p
      WHERE p.shop_domain = ${shopDomain}
        AND p.created_at >= NOW() - INTERVAL '14 days'
        AND COALESCE(p.client_id, '') = ANY(
          ARRAY(SELECT DISTINCT client_id FROM cart_related WHERE client_id <> '')
        )
    )
    SELECT external_id, client_id
    FROM stitched
    WHERE external_id IS NOT NULL
      AND external_id <> ''
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

  const externalId = rows[0]?.external_id ? String(rows[0].external_id).trim() : '';
  const clientId = rows[0]?.client_id ? String(rows[0].client_id).trim() : '';

  return {
    externalId: externalId || null,
    clientId: clientId || null,
  };
};

const resolveSubscriberClientId = async (shopDomain: string, externalId?: string | null) => {
  const normalizedExternalId = externalId ? String(externalId).trim() : '';
  if (!normalizedExternalId) {
    return {
      clientId: null as string | null,
      shopifyAnalyticsClientId: null as string | null,
    };
  }

  const sql = getNeonSql();
  const { audienceRead, d1GetSubscriberClientIds } = await import(
    '@/lib/server/integrations/d1-audience'
  );

  const resolved = await audienceRead<{
    clientId: string | null;
    shopifyAnalyticsClientId: string | null;
  }>({
    label: 'cartsUpdate.resolveSubscriberClientId',
    key: (v) => `${v.clientId ?? ''}|${v.shopifyAnalyticsClientId ?? ''}`,
    neon: async () => {
      const rows = await sql`
        SELECT
          s.device_context ->> 'clientId' AS client_id,
          s.device_context ->> 'shopifyAnalyticsClientId' AS shopify_analytics_client_id
        FROM subscribers s
        JOIN subscriber_tokens t ON t.subscriber_id = s.id
        WHERE s.shop_domain = ${shopDomain}
          AND t.shop_domain = ${shopDomain}
          AND t.status = 'active'
          AND s.external_id = ${normalizedExternalId}
          AND (
            COALESCE(s.device_context ->> 'clientId', '') <> ''
            OR COALESCE(s.device_context ->> 'shopifyAnalyticsClientId', '') <> ''
          )
        ORDER BY t.last_seen_at DESC NULLS LAST, t.updated_at DESC
        LIMIT 1
      `;
      const clientId = rows[0]?.client_id ? String(rows[0].client_id).trim() : '';
      const shopifyAnalyticsClientId = rows[0]?.shopify_analytics_client_id
        ? String(rows[0].shopify_analytics_client_id).trim()
        : '';
      return {
        clientId: clientId || null,
        shopifyAnalyticsClientId: shopifyAnalyticsClientId || null,
      };
    },
    d1: async () => {
      const result = await d1GetSubscriberClientIds(shopDomain, normalizedExternalId);
      const clientId = result.clientId ? result.clientId.trim() : '';
      const shopifyAnalyticsClientId = result.shopifyAnalyticsClientId
        ? result.shopifyAnalyticsClientId.trim()
        : '';
      return {
        clientId: clientId || null,
        shopifyAnalyticsClientId: shopifyAnalyticsClientId || null,
      };
    },
  });

  return resolved;
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-shopify-hmac-sha256');

    if (!verifyShopifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as ShopifyCartPayload;
    const shopDomain = parseShopDomain(request.headers.get('x-shopify-shop-domain'));
    const eventId = request.headers.get('x-shopify-event-id');

    // Collection gate FIRST: carts/update fires on every cart change for every
    // visitor and is ~94% of all webhook volume. If Abandoned Cart Recovery is
    // off for this shop, do zero work (no dedup, no Neon, no D1) and just ack.
    if (!(await shouldCollectEventType(shopDomain, 'add_to_cart'))) {
      return NextResponse.json({ ok: true, shopDomain, skipped: 'cart_automation_inactive' });
    }

    if (eventId) {
      const accepted = await registerWebhookEvent({
        shopDomain,
        topic: 'carts/update',
        eventId,
      });

      if (!accepted) {
        return NextResponse.json({ ok: true, duplicate: true, shopDomain });
      }
    }

    if (!payload.token) {
      return NextResponse.json({ ok: true, shopDomain, skipped: 'missing-token' });
    }

    deferAfterResponse(async () => {
      const cartSignalIdentity = await resolveIdentityFromCartSignals(shopDomain, payload.token ?? null);

      const attributeExternalId = getCartAttribute(payload, '_push_eagle_external_id');
      const fallbackExternalId = deriveExternalId(shopDomain, payload.token ?? null);
      const resolvedExternalId = attributeExternalId
        || cartSignalIdentity.externalId
        || fallbackExternalId;
      const externalId = resolvedExternalId;
      if (!externalId) {
        return;
      }

      const identitySource = attributeExternalId
        ? 'attribute'
        : cartSignalIdentity.externalId
          ? 'signal'
          : 'fallback_cart_token';

      const subscriberClientIdentity = await resolveSubscriberClientId(shopDomain, externalId);
      const shopifyAnalyticsClientId = getCartAttribute(payload, '_push_eagle_shopify_analytics_client_id')
        || subscriberClientIdentity.shopifyAnalyticsClientId;
      const clientId = getCartAttribute(payload, '_push_eagle_client_id')
        || cartSignalIdentity.clientId
        || subscriberClientIdentity.clientId
        || shopifyAnalyticsClientId;

      const firstLineItem = (payload.line_items ?? [])[0];
      await recordSubscriberActivity({
        shopDomain,
        externalId,
        eventType: 'add_to_cart',
        pageUrl: firstLineItem?.url ?? '/cart',
        productId: firstLineItem?.product_id ? String(firstLineItem.product_id) : null,
        cartToken: payload.token ?? null,
        metadata: {
          cartId: payload.id ? String(payload.id) : null,
          variantId: firstLineItem?.variant_id ? String(firstLineItem.variant_id) : null,
          quantity: firstLineItem?.quantity ?? null,
          updatedAt: payload.updated_at ?? null,
          clientId,
          shopifyAnalyticsClientId,
          cartIdentitySource: identitySource,
        },
      });
    });

    return NextResponse.json({ ok: true, shopDomain });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process carts webhook.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
