import { env } from '@/lib/config/env';

/**
 * Cloudflare D1 backing store for the Shopify product/variant catalog cache.
 *
 * This table (`shopify_product_variants` on Neon) is a self-contained cache that
 * is only ever queried by shop_domain + variant_id / inventory_item_id (never
 * joined to other tables), which makes it a safe candidate to move off Neon. It
 * grows with catalog size x merchant count, so keeping it on Neon's tiny free
 * tier is wasteful. D1's 5 GB free storage holds it comfortably.
 *
 * The flag (`D1_CATALOG_ENABLED`) is an explicit opt-in: when off, everything
 * keeps using Neon exactly as before. When on, the catalog is read/written from
 * D1 instead. The table self-heals (it is repopulated by product syncs and
 * inventory webhooks), so no backfill is required — new rows simply land in D1.
 */
export const isD1CatalogEnabled = () =>
  env.D1_CATALOG_ENABLED
  && Boolean(env.CLOUDFLARE_ACCOUNT_ID.trim())
  && Boolean(env.CLOUDFLARE_API_TOKEN.trim())
  && Boolean(env.CLOUDFLARE_D1_DATABASE_ID.trim());

type D1QueryResult = {
  success: boolean;
  result?: Array<{
    results?: unknown[];
    meta?: Record<string, unknown>;
  }>;
  errors?: Array<{ message?: string }>;
};

const runD1Query = async (sql: string, params: unknown[] = []) => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID.trim();
  const databaseId = env.CLOUDFLARE_D1_DATABASE_ID.trim();

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    },
  );

  const payload = (await response.json()) as D1QueryResult;
  if (!response.ok || !payload.success) {
    const message = payload.errors?.[0]?.message ?? `D1 query failed (${response.status}).`;
    throw new Error(message);
  }

  return payload.result?.[0]?.results ?? [];
};

let schemaReady = false;

export const ensureD1CatalogSchema = async () => {
  if (schemaReady || !isD1CatalogEnabled()) {
    return;
  }

  // Composite PRIMARY KEY doubles as the unique constraint that the upsert
  // (ON CONFLICT) relies on, mirroring the Neon UNIQUE (shop_domain, variant_id).
  await runD1Query(`
    CREATE TABLE IF NOT EXISTS shopify_product_variants (
      shop_domain TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      inventory_item_id TEXT,
      product_title TEXT,
      variant_title TEXT,
      handle TEXT,
      image_url TEXT,
      price_cents INTEGER,
      compare_at_price_cents INTEGER,
      available INTEGER,
      updated_at TEXT,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (shop_domain, variant_id)
    )
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_variants_shop_inventory
    ON shopify_product_variants(shop_domain, inventory_item_id)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_variants_shop_product
    ON shopify_product_variants(shop_domain, product_id)
  `);

  schemaReady = true;
};

export type D1ExistingVariant = {
  priceCents: number | null;
  compareAtPriceCents: number | null;
  available: number | null;
};

const toNumberOrNull = (value: unknown) => (value == null ? null : Number(value));

/**
 * Returns the currently-stored price/availability for the given variant ids so
 * callers can detect price drops before overwriting the row (mirrors the Neon
 * SELECT ... WHERE variant_id = ANY(...)).
 */
export const d1GetExistingVariants = async (
  shopDomain: string,
  variantIds: string[],
): Promise<Map<string, D1ExistingVariant>> => {
  const result = new Map<string, D1ExistingVariant>();
  if (variantIds.length === 0) {
    return result;
  }

  await ensureD1CatalogSchema();

  const placeholders = variantIds.map(() => '?').join(', ');
  const rows = await runD1Query(
    `
      SELECT variant_id, price_cents, compare_at_price_cents, available
      FROM shopify_product_variants
      WHERE shop_domain = ?
        AND variant_id IN (${placeholders})
    `,
    [shopDomain, ...variantIds],
  );

  for (const row of rows as Array<Record<string, unknown>>) {
    const variantId = String(row.variant_id ?? '');
    if (!variantId) {
      continue;
    }
    result.set(variantId, {
      priceCents: toNumberOrNull(row.price_cents),
      compareAtPriceCents: toNumberOrNull(row.compare_at_price_cents),
      available: toNumberOrNull(row.available),
    });
  }

  return result;
};

export type D1UpsertVariantInput = {
  shopDomain: string;
  productId: string;
  variantId: string;
  inventoryItemId: string | null;
  productTitle: string | null;
  variantTitle: string | null;
  handle: string | null;
  imageUrl: string | null;
  priceCents: number | null;
  compareAtPriceCents: number | null;
  available: number | null;
  updatedAtIso: string;
  lastSeenAtIso: string;
};

/**
 * Upserts a single variant, preserving previously-stored non-null values when
 * the incoming payload omits them (COALESCE), exactly like the Neon upsert.
 */
export const d1UpsertVariant = async (input: D1UpsertVariantInput) => {
  await ensureD1CatalogSchema();

  await runD1Query(
    `
      INSERT INTO shopify_product_variants (
        shop_domain, product_id, variant_id, inventory_item_id, product_title,
        variant_title, handle, image_url, price_cents, compare_at_price_cents,
        available, updated_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_domain, variant_id) DO UPDATE SET
        product_id = excluded.product_id,
        inventory_item_id = COALESCE(excluded.inventory_item_id, shopify_product_variants.inventory_item_id),
        product_title = COALESCE(excluded.product_title, shopify_product_variants.product_title),
        variant_title = COALESCE(excluded.variant_title, shopify_product_variants.variant_title),
        handle = COALESCE(excluded.handle, shopify_product_variants.handle),
        image_url = COALESCE(excluded.image_url, shopify_product_variants.image_url),
        price_cents = COALESCE(excluded.price_cents, shopify_product_variants.price_cents),
        compare_at_price_cents = COALESCE(excluded.compare_at_price_cents, shopify_product_variants.compare_at_price_cents),
        updated_at = COALESCE(excluded.updated_at, shopify_product_variants.updated_at),
        last_seen_at = excluded.last_seen_at
    `,
    [
      input.shopDomain,
      input.productId,
      input.variantId,
      input.inventoryItemId,
      input.productTitle,
      input.variantTitle,
      input.handle,
      input.imageUrl,
      input.priceCents,
      input.compareAtPriceCents,
      input.available,
      input.updatedAtIso,
      input.lastSeenAtIso,
    ],
  );
};

export type D1VariantByInventory = {
  variantId: string;
  productId: string;
  productTitle: string | null;
  handle: string | null;
  available: number | null;
};

/**
 * Looks up every variant tied to an inventory item (mirrors the Neon read in
 * processInventoryLevelUpdate) so back-in-stock transitions can be detected.
 */
export const d1GetVariantsByInventoryItem = async (
  shopDomain: string,
  inventoryItemId: string,
): Promise<D1VariantByInventory[]> => {
  await ensureD1CatalogSchema();

  const rows = await runD1Query(
    `
      SELECT variant_id, product_id, product_title, handle, available
      FROM shopify_product_variants
      WHERE shop_domain = ?
        AND inventory_item_id = ?
    `,
    [shopDomain, inventoryItemId],
  );

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    variantId: String(row.variant_id ?? ''),
    productId: String(row.product_id ?? ''),
    productTitle: row.product_title == null ? null : String(row.product_title),
    handle: row.handle == null ? null : String(row.handle),
    available: toNumberOrNull(row.available),
  }));
};

export const d1UpdateVariantAvailabilityByInventoryItem = async (input: {
  shopDomain: string;
  inventoryItemId: string;
  available: number | null;
  updatedAtIso: string;
  lastSeenAtIso: string;
}) => {
  await ensureD1CatalogSchema();

  await runD1Query(
    `
      UPDATE shopify_product_variants
      SET available = ?, updated_at = ?, last_seen_at = ?
      WHERE shop_domain = ?
        AND inventory_item_id = ?
    `,
    [
      input.available,
      input.updatedAtIso,
      input.lastSeenAtIso,
      input.shopDomain,
      input.inventoryItemId,
    ],
  );
};
