import { env } from '@/lib/config/env';

/**
 * Cloudflare D1 backing store for the high-volume Shopify commerce cache:
 * `shopify_orders`, `shopify_order_items`, `shopify_fulfillments`.
 *
 * Why this is safe to move off Neon: everywhere orders touch subscribers it is via
 * the subscriber_id NUMBER only (stored on the order, returned by aggregation) —
 * there is never an in-database JOIN from orders to the `subscribers` table. So the
 * commerce tables are self-contained (order_items -> orders is the only real join,
 * and both live here together), and segmentation/attribution just read back
 * subscriber_id integers and intersect in app code.
 *
 * The flag (`D1_COMMERCE_ENABLED`) is an explicit opt-in. When off, everything keeps
 * using Neon byte-for-byte. When on, orders live in D1, self-heal from order/
 * fulfillment webhooks going forward, and a one-time backfill copies history.
 */
export const isD1CommerceEnabled = () =>
  env.D1_COMMERCE_ENABLED
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

const asRows = (rows: unknown[]) => rows as Array<Record<string, unknown>>;
const toIso = (value: unknown): string => {
  if (value == null) {
    return new Date().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

let schemaReady = false;

export const ensureD1CommerceSchema = async () => {
  if (schemaReady || !isD1CommerceEnabled()) {
    return;
  }

  await runD1Query(`
    CREATE TABLE IF NOT EXISTS shopify_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_domain TEXT NOT NULL,
      order_id TEXT NOT NULL,
      external_id TEXT,
      customer_id TEXT,
      email TEXT,
      subscriber_id INTEGER,
      total_price_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  await runD1Query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_d1_orders_shop_order
    ON shopify_orders(shop_domain, order_id)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_orders_shop_subscriber
    ON shopify_orders(shop_domain, subscriber_id, created_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_orders_shop_external
    ON shopify_orders(shop_domain, external_id, created_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_orders_shop_customer
    ON shopify_orders(shop_domain, customer_id, created_at)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_orders_created
    ON shopify_orders(created_at)
  `);

  await runD1Query(`
    CREATE TABLE IF NOT EXISTS shopify_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_domain TEXT NOT NULL,
      order_id TEXT NOT NULL,
      order_event_id INTEGER,
      product_id TEXT,
      product_title TEXT,
      collection_hint TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_order_items_shop_order
    ON shopify_order_items(shop_domain, order_id)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_order_items_shop_product
    ON shopify_order_items(shop_domain, product_title)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_order_items_event
    ON shopify_order_items(order_event_id)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_order_items_created
    ON shopify_order_items(created_at)
  `);

  await runD1Query(`
    CREATE TABLE IF NOT EXISTS shopify_fulfillments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_domain TEXT NOT NULL,
      fulfillment_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      status TEXT,
      shipment_status TEXT,
      tracking_company TEXT,
      tracking_numbers TEXT,
      tracking_urls TEXT,
      updated_at TEXT,
      last_seen_at TEXT NOT NULL
    )
  `);
  await runD1Query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_d1_fulfillments_shop_fulfillment
    ON shopify_fulfillments(shop_domain, fulfillment_id)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_fulfillments_last_seen
    ON shopify_fulfillments(last_seen_at)
  `);

  schemaReady = true;
};

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export type D1OrderLineItem = {
  productId?: string | null;
  productTitle?: string | null;
  collectionHint?: string | null;
};

export type D1UpsertOrderInput = {
  shopDomain: string;
  orderId: string;
  externalId?: string | null;
  customerId?: string | null;
  email?: string | null;
  subscriberId?: number | null;
  totalPriceCents: number;
  createdAt?: string | Date | null;
  lineItems?: D1OrderLineItem[];
};

/**
 * Mirrors the Neon order upsert: order row upserts on (shop_domain, order_id),
 * then line items are replaced. Returns the order's D1 id (order_event_id).
 */
export const d1UpsertOrderEvent = async (input: D1UpsertOrderInput): Promise<number> => {
  await ensureD1CommerceSchema();
  const createdAtIso = toIso(input.createdAt ?? new Date());

  const rows = await runD1Query(
    `
      INSERT INTO shopify_orders (
        shop_domain, order_id, external_id, customer_id, email, subscriber_id, total_price_cents, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_domain, order_id) DO UPDATE SET
        external_id = COALESCE(excluded.external_id, shopify_orders.external_id),
        customer_id = COALESCE(excluded.customer_id, shopify_orders.customer_id),
        email = COALESCE(excluded.email, shopify_orders.email),
        subscriber_id = COALESCE(excluded.subscriber_id, shopify_orders.subscriber_id),
        total_price_cents = excluded.total_price_cents,
        created_at = COALESCE(excluded.created_at, shopify_orders.created_at)
      RETURNING id
    `,
    [
      input.shopDomain,
      input.orderId,
      input.externalId ?? null,
      input.customerId ?? null,
      input.email ?? null,
      input.subscriberId ?? null,
      Math.round(Number(input.totalPriceCents) || 0),
      createdAtIso,
    ],
  );

  const orderEventId = Number(asRows(rows)[0]?.id ?? 0);

  await runD1Query(
    `DELETE FROM shopify_order_items WHERE shop_domain = ? AND order_id = ?`,
    [input.shopDomain, input.orderId],
  );

  for (const item of input.lineItems ?? []) {
    await runD1Query(
      `
        INSERT INTO shopify_order_items (
          shop_domain, order_id, order_event_id, product_id, product_title, collection_hint, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.shopDomain,
        input.orderId,
        orderEventId,
        item.productId ?? null,
        item.productTitle ?? null,
        item.collectionHint ?? null,
        createdAtIso,
      ],
    );
  }

  return orderEventId;
};

export type D1UpsertFulfillmentInput = {
  shopDomain: string;
  fulfillmentId: string;
  orderId: string;
  status?: string | null;
  shipmentStatus?: string | null;
  trackingCompany?: string | null;
  trackingNumbers?: unknown;
  trackingUrls?: unknown;
  updatedAt?: string | Date | null;
};

export const d1UpsertFulfillment = async (input: D1UpsertFulfillmentInput) => {
  await ensureD1CommerceSchema();
  const nowIso = new Date().toISOString();
  const updatedAtIso = input.updatedAt ? toIso(input.updatedAt) : nowIso;

  await runD1Query(
    `
      INSERT INTO shopify_fulfillments (
        shop_domain, fulfillment_id, order_id, status, shipment_status,
        tracking_company, tracking_numbers, tracking_urls, updated_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shop_domain, fulfillment_id) DO UPDATE SET
        order_id = excluded.order_id,
        status = COALESCE(excluded.status, shopify_fulfillments.status),
        shipment_status = COALESCE(excluded.shipment_status, shopify_fulfillments.shipment_status),
        tracking_company = COALESCE(excluded.tracking_company, shopify_fulfillments.tracking_company),
        tracking_numbers = excluded.tracking_numbers,
        tracking_urls = excluded.tracking_urls,
        updated_at = COALESCE(excluded.updated_at, shopify_fulfillments.updated_at),
        last_seen_at = excluded.last_seen_at
    `,
    [
      input.shopDomain,
      input.fulfillmentId,
      input.orderId,
      input.status ?? null,
      input.shipmentStatus ?? null,
      input.trackingCompany ?? null,
      JSON.stringify(input.trackingNumbers ?? []),
      JSON.stringify(input.trackingUrls ?? []),
      updatedAtIso,
      nowIso,
    ],
  );
};

// ---------------------------------------------------------------------------
// Reads: attribution
// ---------------------------------------------------------------------------

export type D1OrderIdentity = {
  subscriber_id: number | null;
  external_id: string | null;
  customer_id: string | null;
};

/** Most recent order for an order_id: its subscriber/external/customer identity. */
export const d1GetOrderIdentityByOrderId = async (
  shopDomain: string,
  orderId: string,
): Promise<D1OrderIdentity | null> => {
  await ensureD1CommerceSchema();
  const rows = await runD1Query(
    `
      SELECT subscriber_id, external_id, customer_id
      FROM shopify_orders
      WHERE shop_domain = ? AND order_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [shopDomain, orderId],
  );
  const row = asRows(rows)[0];
  if (!row) {
    return null;
  }
  return {
    subscriber_id: row.subscriber_id == null ? null : Number(row.subscriber_id),
    external_id: row.external_id == null ? null : String(row.external_id),
    customer_id: row.customer_id == null ? null : String(row.customer_id),
  };
};

export const d1HasRecentOrder = async (input: {
  shopDomain: string;
  externalId: string | null;
  customerId: string | null;
  since: string;
}): Promise<boolean> => {
  const externalId = input.externalId?.trim() || null;
  const customerId = input.customerId?.trim() || null;
  if (!externalId && !customerId) {
    return false;
  }
  await ensureD1CommerceSchema();
  const sinceIso = toIso(input.since);

  const clauses: string[] = [];
  const params: unknown[] = [input.shopDomain, sinceIso];
  if (externalId) {
    clauses.push('external_id = ?');
    params.push(externalId);
  }
  if (customerId) {
    clauses.push('customer_id = ?');
    params.push(customerId);
  }

  const rows = await runD1Query(
    `
      SELECT id
      FROM shopify_orders
      WHERE shop_domain = ?
        AND created_at > ?
        AND (${clauses.join(' OR ')})
      LIMIT 1
    `,
    params,
  );
  return asRows(rows).length > 0;
};

/** Historical external ids for a customer/email, newest first. */
export const d1GetHistoricalOrderExternalIds = async (input: {
  shopDomain: string;
  customerId: string | null;
  email: string | null;
  limit?: number;
}): Promise<Array<{ external_id: string | null }>> => {
  const customerId = input.customerId?.trim() || null;
  const email = input.email?.trim().toLowerCase() || null;
  if (!customerId && !email) {
    return [];
  }
  await ensureD1CommerceSchema();

  const clauses: string[] = [];
  const params: unknown[] = [input.shopDomain];
  if (customerId) {
    clauses.push('customer_id = ?');
    params.push(customerId);
  }
  if (email) {
    clauses.push('LOWER(email) = ?');
    params.push(email);
  }
  params.push(Math.max(1, input.limit ?? 25));

  const rows = await runD1Query(
    `
      SELECT external_id
      FROM shopify_orders
      WHERE shop_domain = ?
        AND external_id IS NOT NULL
        AND external_id <> ''
        AND (${clauses.join(' OR ')})
      ORDER BY created_at DESC
      LIMIT ?
    `,
    params,
  );
  return asRows(rows).map((row) => ({
    external_id: row.external_id == null ? null : String(row.external_id),
  }));
};

// ---------------------------------------------------------------------------
// Reads: segmentation
// ---------------------------------------------------------------------------

export type D1PurchaseStatRow = { subscriber_id: number; total: number; last_at: string | null };

/** Per-subscriber order count + last order time (segment "Purchased"). */
export const d1GetPurchasedSubscriberStats = async (
  shopDomain: string,
): Promise<D1PurchaseStatRow[]> => {
  await ensureD1CommerceSchema();
  const rows = await runD1Query(
    `
      SELECT subscriber_id, COUNT(*) AS total, MAX(created_at) AS last_at
      FROM shopify_orders
      WHERE shop_domain = ? AND subscriber_id IS NOT NULL
      GROUP BY subscriber_id
    `,
    [shopDomain],
  );
  return asRows(rows).map((row) => ({
    subscriber_id: Number(row.subscriber_id),
    total: Number(row.total ?? 0),
    last_at: row.last_at == null ? null : String(row.last_at),
  }));
};

/**
 * Per-subscriber product/collection purchase count + last time (segment
 * "Purchased a product" / "Purchased from collection"). Joins items->orders
 * inside D1; subscriber_id is just returned. SQLite has no ILIKE, so we lower-case
 * both sides for a case-insensitive contains match, matching the Neon ILIKE.
 */
export const d1GetProductPurchaseStats = async (
  shopDomain: string,
  options: { byCollection: boolean; textFilter: string },
): Promise<D1PurchaseStatRow[]> => {
  await ensureD1CommerceSchema();
  const textFilter = options.textFilter.trim();

  const params: unknown[] = [shopDomain];
  let filterClause = '';
  if (textFilter) {
    const column = options.byCollection ? 'i.collection_hint' : 'i.product_title';
    filterClause = `AND LOWER(${column}) LIKE ?`;
    params.push(`%${textFilter.toLowerCase()}%`);
  }

  const rows = await runD1Query(
    `
      SELECT o.subscriber_id AS subscriber_id, COUNT(*) AS total, MAX(o.created_at) AS last_at
      FROM shopify_order_items i
      JOIN shopify_orders o ON o.id = i.order_event_id
      WHERE o.shop_domain = ?
        AND o.subscriber_id IS NOT NULL
        ${filterClause}
      GROUP BY o.subscriber_id
    `,
    params,
  );
  return asRows(rows).map((row) => ({
    subscriber_id: Number(row.subscriber_id),
    total: Number(row.total ?? 0),
    last_at: row.last_at == null ? null : String(row.last_at),
  }));
};

// ---------------------------------------------------------------------------
// Reads / deletes: GDPR
// ---------------------------------------------------------------------------

type ComplianceScope = {
  ordersRequested?: string[];
  customerId: string | null;
  email: string | null;
};

const buildComplianceWhere = (scope: ComplianceScope) => {
  const customerId = scope.customerId?.trim() || null;
  const email = scope.email?.trim().toLowerCase() || null;
  const orders = (scope.ordersRequested ?? []).filter(Boolean);

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (orders.length > 0) {
    clauses.push(`order_id IN (${orders.map(() => '?').join(', ')})`);
    params.push(...orders);
  }
  if (customerId) {
    clauses.push('customer_id = ?');
    params.push(customerId);
  }
  if (email) {
    clauses.push('LOWER(email) = ?');
    params.push(email);
  }
  return { clause: clauses.join(' OR '), params, hasAny: clauses.length > 0 };
};

export const d1GetOrderSubscriberIdsForCompliance = async (
  shopDomain: string,
  scope: ComplianceScope,
): Promise<number[]> => {
  const { clause, params, hasAny } = buildComplianceWhere(scope);
  if (!hasAny) {
    return [];
  }
  await ensureD1CommerceSchema();
  const rows = await runD1Query(
    `
      SELECT DISTINCT subscriber_id
      FROM shopify_orders
      WHERE shop_domain = ?
        AND subscriber_id IS NOT NULL
        AND (${clause})
    `,
    [shopDomain, ...params],
  );
  return asRows(rows)
    .map((row) => Number(row.subscriber_id))
    .filter((id) => Number.isFinite(id));
};

export type D1ComplianceOrderRow = {
  order_id: string;
  customer_id: string | null;
  email: string | null;
  total_price_cents: number;
  created_at: string | null;
};

export const d1GetOrdersForCompliance = async (
  shopDomain: string,
  scope: ComplianceScope,
): Promise<D1ComplianceOrderRow[]> => {
  const { clause, params, hasAny } = buildComplianceWhere(scope);
  if (!hasAny) {
    return [];
  }
  await ensureD1CommerceSchema();
  const rows = await runD1Query(
    `
      SELECT order_id, customer_id, email, total_price_cents, created_at
      FROM shopify_orders
      WHERE shop_domain = ?
        AND (${clause})
    `,
    [shopDomain, ...params],
  );
  return asRows(rows).map((row) => ({
    order_id: String(row.order_id ?? ''),
    customer_id: row.customer_id == null ? null : String(row.customer_id),
    email: row.email == null ? null : String(row.email),
    total_price_cents: Number(row.total_price_cents ?? 0),
    created_at: row.created_at == null ? null : String(row.created_at),
  }));
};

export const d1DeleteOrders = async (shopDomain: string, scope: ComplianceScope) => {
  const { clause, params, hasAny } = buildComplianceWhere(scope);
  if (!hasAny) {
    return;
  }
  await ensureD1CommerceSchema();

  // Delete the child items first (no FK cascade in D1), scoped to the same orders.
  await runD1Query(
    `
      DELETE FROM shopify_order_items
      WHERE shop_domain = ?
        AND order_id IN (
          SELECT order_id FROM shopify_orders
          WHERE shop_domain = ? AND (${clause})
        )
    `,
    [shopDomain, shopDomain, ...params],
  );
  await runD1Query(
    `
      DELETE FROM shopify_orders
      WHERE shop_domain = ? AND (${clause})
    `,
    [shopDomain, ...params],
  );
};

export const d1DeleteAllCommerceForShop = async (shopDomain: string) => {
  await ensureD1CommerceSchema();
  await runD1Query(`DELETE FROM shopify_order_items WHERE shop_domain = ?`, [shopDomain]);
  await runD1Query(`DELETE FROM shopify_orders WHERE shop_domain = ?`, [shopDomain]);
  await runD1Query(`DELETE FROM shopify_fulfillments WHERE shop_domain = ?`, [shopDomain]);
};

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export const d1PruneCommerce = async (input: {
  orderCutoffIso: string;
  fulfillmentCutoffIso: string;
}) => {
  await ensureD1CommerceSchema();
  // order_items has no FK cascade in D1, so delete the orphaned children explicitly.
  await runD1Query(
    `
      DELETE FROM shopify_order_items
      WHERE order_event_id IN (
        SELECT id FROM shopify_orders WHERE created_at < ?
      )
    `,
    [input.orderCutoffIso],
  );
  await runD1Query(`DELETE FROM shopify_order_items WHERE created_at < ?`, [input.orderCutoffIso]);
  await runD1Query(`DELETE FROM shopify_orders WHERE created_at < ?`, [input.orderCutoffIso]);
  await runD1Query(`DELETE FROM shopify_fulfillments WHERE last_seen_at < ?`, [
    input.fulfillmentCutoffIso,
  ]);
};

// ---------------------------------------------------------------------------
// Counts (backfill / parity)
// ---------------------------------------------------------------------------

const countTable = async (table: string, shopDomain?: string): Promise<number> => {
  await ensureD1CommerceSchema();
  const rows = shopDomain
    ? await runD1Query(`SELECT COUNT(*) AS count FROM ${table} WHERE shop_domain = ?`, [shopDomain])
    : await runD1Query(`SELECT COUNT(*) AS count FROM ${table}`);
  const first = asRows(rows)[0];
  return first ? Number(first.count ?? 0) : 0;
};

export const d1CountOrders = (shopDomain?: string) => countTable('shopify_orders', shopDomain);
export const d1CountOrderItems = (shopDomain?: string) => countTable('shopify_order_items', shopDomain);
export const d1CountFulfillments = (shopDomain?: string) =>
  countTable('shopify_fulfillments', shopDomain);

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

/**
 * Isolated end-to-end proof that the commerce D1 path works (write order + item +
 * fulfillment -> read back via the same helpers segmentation/attribution use ->
 * clean up) before flipping D1_COMMERCE_ENABLED on. Uses a throwaway shop domain so
 * it never touches real merchant data.
 */
export const d1CommerceSelfTest = async () => {
  if (!isD1CommerceEnabled()) {
    return { ok: false, reason: 'D1_COMMERCE_ENABLED is off' as const };
  }

  const shopDomain = `__selftest__.${Date.now()}.myshopify.com`;
  const orderId = `selftest-order-${Date.now()}`;
  const fulfillmentId = `selftest-ful-${Date.now()}`;
  const steps: Record<string, boolean> = {};

  try {
    await d1UpsertOrderEvent({
      shopDomain,
      orderId,
      externalId: 'selftest-ext',
      customerId: 'selftest-cust',
      email: 'selftest@example.com',
      subscriberId: 987654321,
      totalPriceCents: 12345,
      createdAt: new Date(),
      lineItems: [
        { productId: 'p1', productTitle: 'Self Test Widget', collectionHint: 'Self Test Collection' },
      ],
    });
    steps.write = true;

    const identity = await d1GetOrderIdentityByOrderId(shopDomain, orderId);
    steps.readIdentity = identity?.subscriber_id === 987654321;

    const purchased = await d1GetPurchasedSubscriberStats(shopDomain);
    steps.readPurchased = purchased.some((r) => r.subscriber_id === 987654321 && r.total === 1);

    const product = await d1GetProductPurchaseStats(shopDomain, {
      byCollection: false,
      textFilter: 'self test widget',
    });
    steps.readProduct = product.some((r) => r.subscriber_id === 987654321);

    await d1UpsertFulfillment({
      shopDomain,
      fulfillmentId,
      orderId,
      status: 'success',
      shipmentStatus: 'in_transit',
      trackingCompany: 'SelfTest Carrier',
      trackingNumbers: ['ST123'],
      trackingUrls: ['https://example.com/track'],
      updatedAt: new Date(),
    });
    steps.writeFulfillment = true;

    const orders = await d1GetOrdersForCompliance(shopDomain, {
      customerId: 'selftest-cust',
      email: null,
    });
    steps.readCompliance = orders.some((o) => o.order_id === orderId);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error ?? ''),
      steps,
    };
  } finally {
    // Best-effort cleanup so the self-test never leaves rows behind.
    try {
      await d1DeleteAllCommerceForShop(shopDomain);
    } catch {
      // ignore cleanup failures
    }
  }

  const ok = Object.values(steps).every(Boolean) && Object.keys(steps).length === 6;
  return { ok, steps };
};
