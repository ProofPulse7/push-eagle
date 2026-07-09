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

const isNumericProductId = (value: string) => /^\d+$/.test(value);

const lookupNeonProductImage = async (input: {
  shopDomain: string;
  productId?: string | null;
  handle?: string | null;
  variantId?: string | null;
}) => {
  const sql = getNeonSql();

  if (input.variantId) {
    const variantRows = await sql`
      SELECT image_url
      FROM shopify_product_variants
      WHERE shop_domain = ${input.shopDomain}
        AND variant_id = ${input.variantId}
        AND image_url IS NOT NULL
        AND image_url <> ''
      ORDER BY updated_at DESC NULLS LAST, last_seen_at DESC NULLS LAST
      LIMIT 1
    `;
    const variantImage = variantRows[0]?.image_url ? String(variantRows[0].image_url).trim() : '';
    if (variantImage) {
      return variantImage;
    }
  }

  const productId = input.productId ? String(input.productId).trim() : '';
  if (productId && isNumericProductId(productId)) {
    const productRows = await sql`
      SELECT image_url
      FROM shopify_product_variants
      WHERE shop_domain = ${input.shopDomain}
        AND product_id = ${productId}
        AND image_url IS NOT NULL
        AND image_url <> ''
      ORDER BY updated_at DESC NULLS LAST, last_seen_at DESC NULLS LAST
      LIMIT 1
    `;
    const productImage = productRows[0]?.image_url ? String(productRows[0].image_url).trim() : '';
    if (productImage) {
      return productImage;
    }
  }

  const handle = input.handle ? String(input.handle).trim().toLowerCase() : '';
  if (handle) {
    const handleRows = await sql`
      SELECT image_url
      FROM shopify_product_variants
      WHERE shop_domain = ${input.shopDomain}
        AND LOWER(handle) = ${handle}
        AND image_url IS NOT NULL
        AND image_url <> ''
      ORDER BY updated_at DESC NULLS LAST, last_seen_at DESC NULLS LAST
      LIMIT 1
    `;
    const handleImage = handleRows[0]?.image_url ? String(handleRows[0].image_url).trim() : '';
    if (handleImage) {
      return handleImage;
    }
  }

  if (productId && !isNumericProductId(productId)) {
    const slugRows = await sql`
      SELECT image_url
      FROM shopify_product_variants
      WHERE shop_domain = ${input.shopDomain}
        AND LOWER(handle) = ${productId.toLowerCase()}
        AND image_url IS NOT NULL
        AND image_url <> ''
      ORDER BY updated_at DESC NULLS LAST, last_seen_at DESC NULLS LAST
      LIMIT 1
    `;
    const slugImage = slugRows[0]?.image_url ? String(slugRows[0].image_url).trim() : '';
    if (slugImage) {
      return slugImage;
    }
  }

  return null;
};

export const resolveShopifyProductImageUrl = async (
  shopDomain: string,
  productId: string,
  variantId?: string | null,
): Promise<string | null> => {
  const normalizedProductId = String(productId ?? '').trim();
  const normalizedVariantId = variantId ? String(variantId).trim() : '';
  if (!shopDomain || (!normalizedProductId && !normalizedVariantId)) {
    return null;
  }

  if (isD1CatalogEnabled()) {
    const { d1GetProductImageUrl, d1GetProductImageUrlByHandle, d1GetProductImageUrlByVariant } = await import('@/lib/server/integrations/d1-catalog');
    if (normalizedVariantId) {
      const variantImage = await d1GetProductImageUrlByVariant(shopDomain, normalizedVariantId);
      if (variantImage) {
        return variantImage;
      }
    }
    if (normalizedProductId && isNumericProductId(normalizedProductId)) {
      const d1Image = await d1GetProductImageUrl(shopDomain, normalizedProductId);
      if (d1Image) {
        return d1Image;
      }
    }
    if (normalizedProductId) {
      const handleImage = await d1GetProductImageUrlByHandle(shopDomain, normalizedProductId);
      if (handleImage) {
        return handleImage;
      }
    }
  }

  return lookupNeonProductImage({
    shopDomain,
    productId: normalizedProductId,
    handle: normalizedProductId && !isNumericProductId(normalizedProductId) ? normalizedProductId : null,
    variantId: normalizedVariantId,
  });
};

export const resolveCartReminderProductImage = async (input: {
  shopDomain: string;
  stepKey: CartStepKey;
  cartProductIds?: string[] | null;
  cartToken?: string | null;
  externalId?: string | null;
  fallbackProductId?: string | null;
  fallbackVariantId?: string | null;
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

  return resolveShopifyProductImageUrl(input.shopDomain, productId, input.fallbackVariantId);
};
