import { getNeonSql } from '@/lib/integrations/database/neon';
import { isD1CatalogEnabled } from '@/lib/server/integrations/d1-catalog';
import { isD1EventsEnabled, runD1Query } from '@/lib/server/integrations/d1-events';

export type CartStepKey = 'cart-reminder-1' | 'cart-reminder-2' | 'cart-reminder-3';

const dedupeProductIdsInOrder = (productIds: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const raw of productIds) {
    const productId = String(raw ?? '').trim();
    if (!productId || seen.has(productId)) {
      continue;
    }
    seen.add(productId);
    ordered.push(productId);
  }

  return ordered;
};

type CartProductRow = {
  productId: string;
  createdAt: string;
};

const readProductRowsFromNeon = async (input: {
  shopDomain: string;
  cartToken: string | null;
  externalId: string;
}) => {
  const sql = getNeonSql();
  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = input.cartToken
    ? await sql`
      SELECT product_id, created_at
      FROM subscriber_activity_events
      WHERE shop_domain = ${input.shopDomain}
        AND event_type = 'add_to_cart'
        AND cart_token = ${input.cartToken}
        AND product_id IS NOT NULL
        AND product_id <> ''
        AND created_at >= ${windowStart}
      ORDER BY created_at ASC
    `
    : await sql`
      SELECT product_id, created_at
      FROM subscriber_activity_events
      WHERE shop_domain = ${input.shopDomain}
        AND event_type = 'add_to_cart'
        AND external_id = ${input.externalId}
        AND product_id IS NOT NULL
        AND product_id <> ''
        AND created_at >= ${windowStart}
      ORDER BY created_at ASC
    `;

  return rows
    .map((row) => ({
      productId: String(row.product_id ?? '').trim(),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
    }))
    .filter((row) => row.productId);
};

const readProductRowsFromD1 = async (input: {
  shopDomain: string;
  cartToken: string | null;
  externalId: string;
}) => {
  if (!isD1EventsEnabled()) {
    return [] as CartProductRow[];
  }

  const windowStartIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = input.cartToken
    ? await runD1Query(
        `
          SELECT product_id, created_at
          FROM subscriber_activity_events
          WHERE shop_domain = ?
            AND event_type = 'add_to_cart'
            AND cart_token = ?
            AND product_id IS NOT NULL
            AND product_id <> ''
            AND created_at >= ?
          ORDER BY created_at ASC
        `,
        [input.shopDomain, input.cartToken, windowStartIso],
      )
    : await runD1Query(
        `
          SELECT product_id, created_at
          FROM subscriber_activity_events
          WHERE shop_domain = ?
            AND event_type = 'add_to_cart'
            AND external_id = ?
            AND product_id IS NOT NULL
            AND product_id <> ''
            AND created_at >= ?
          ORDER BY created_at ASC
        `,
        [input.shopDomain, input.externalId, windowStartIso],
      );

  return (rows as Array<Record<string, unknown>>)
    .map((row) => ({
      productId: String(row.product_id ?? '').trim(),
      createdAt: String(row.created_at ?? '').trim(),
    }))
    .filter((row) => row.productId);
};

export const resolveCartReminderProductId = (
  stepKey: CartStepKey,
  productIds: string[],
): string | null => {
  if (productIds.length === 0) {
    return null;
  }

  if (stepKey === 'cart-reminder-1') {
    return productIds[0] ?? null;
  }

  if (stepKey === 'cart-reminder-2') {
    return productIds[1] ?? productIds[0] ?? null;
  }

  return productIds[productIds.length - 1] ?? null;
};


export const listCartProductsInAddOrder = async (input: {
  shopDomain: string;
  cartToken?: string | null;
  externalId: string;
  currentProductId?: string | null;
}) => {
  const cartToken = input.cartToken ? String(input.cartToken).trim() : null;
  const [neonRows, d1Rows] = await Promise.all([
    readProductRowsFromNeon({
      shopDomain: input.shopDomain,
      cartToken,
      externalId: input.externalId,
    }).catch(() => [] as CartProductRow[]),
    readProductRowsFromD1({
      shopDomain: input.shopDomain,
      cartToken,
      externalId: input.externalId,
    }).catch(() => [] as CartProductRow[]),
  ]);

  const mergedRows = [...neonRows, ...d1Rows].sort((left, right) => {
    const leftTime = left.createdAt || '';
    const rightTime = right.createdAt || '';
    if (leftTime && rightTime) {
      return leftTime.localeCompare(rightTime);
    }
    return leftTime ? -1 : 1;
  });

  const currentProductId = input.currentProductId ? String(input.currentProductId).trim() : '';
  if (currentProductId) {
    mergedRows.push({
      productId: currentProductId,
      createdAt: new Date().toISOString(),
    });
  }

  return dedupeProductIdsInOrder(mergedRows.map((row) => row.productId));
};

export const resolveShopifyProductImageUrl = async (
  shopDomain: string,
  productId: string,
): Promise<string | null> => {
  const normalizedProductId = String(productId ?? '').trim();
  if (!shopDomain || !normalizedProductId) {
    return null;
  }

  if (isD1CatalogEnabled()) {
    const { d1GetProductImageUrl } = await import('@/lib/server/integrations/d1-catalog');
    const d1Image = await d1GetProductImageUrl(shopDomain, normalizedProductId);
    if (d1Image) {
      return d1Image;
    }
  }

  const sql = getNeonSql();
  const rows = await sql`
    SELECT image_url
    FROM shopify_product_variants
    WHERE shop_domain = ${shopDomain}
      AND product_id = ${normalizedProductId}
      AND image_url IS NOT NULL
      AND image_url <> ''
    ORDER BY updated_at DESC NULLS LAST, last_seen_at DESC NULLS LAST
    LIMIT 1
  `;

  const imageUrl = rows[0]?.image_url ? String(rows[0].image_url).trim() : '';
  return imageUrl || null;
};

export const resolveCartReminderProductImage = async (input: {
  shopDomain: string;
  stepKey: CartStepKey;
  cartProductIds?: string[] | null;
  cartToken?: string | null;
  externalId?: string | null;
  fallbackProductId?: string | null;
}) => {
  let productIds = Array.isArray(input.cartProductIds)
    ? input.cartProductIds.map((value) => String(value).trim()).filter(Boolean)
    : [];

  if (productIds.length === 0 && input.shopDomain && input.externalId) {
    productIds = await listCartProductsInAddOrder({
      shopDomain: input.shopDomain,
      cartToken: input.cartToken,
      externalId: input.externalId,
      currentProductId: input.fallbackProductId,
    });
  } else if (input.fallbackProductId) {
    productIds = dedupeProductIdsInOrder([...productIds, input.fallbackProductId]);
  }

  const productId = resolveCartReminderProductId(input.stepKey, productIds);
  if (!productId) {
    return null;
  }

  return resolveShopifyProductImageUrl(input.shopDomain, productId);
};
