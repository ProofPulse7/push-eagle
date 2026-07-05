import { env } from '@/lib/config/env';

/**
 * Cloudflare D1 backing store for the Shopify customer cache.
 *
 * `shopify_customers` on Neon is a cache of Shopify customer records (id, email,
 * name, tags) used for: customer-tag segmentation, GDPR export/erasure, revenue
 * attribution (mapping an order's customer/email back to subscriber external
 * ids), and a couple of counts. Every access keys on shop_domain + customer_id /
 * email / external_id — the only relational usage is a JOIN to `subscribers` for
 * tag segmentation, which we reproduce in app code (fetch subscriber external
 * ids from Neon, look up tags here, intersect in JS).
 *
 * The flag (`D1_CUSTOMERS_ENABLED`) is an explicit opt-in. When off, everything
 * keeps using Neon. When on, the cache lives in D1 and self-heals from customer
 * webhooks/order syncs, so no backfill is required.
 */
export const isD1CustomersEnabled = () =>
  env.D1_CUSTOMERS_ENABLED
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

export const ensureD1CustomersSchema = async () => {
  if (schemaReady || !isD1CustomersEnabled()) {
    return;
  }

  // A surrogate INTEGER PK plus a UNIQUE index on (shop_domain, customer_id)
  // mirrors Neon: customer_id rows upsert on conflict, while email-only rows
  // (customer_id NULL) simply append (SQLite treats NULLs as distinct, like PG).
  await runD1Query(`
    CREATE TABLE IF NOT EXISTS shopify_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_domain TEXT NOT NULL,
      customer_id TEXT,
      external_id TEXT,
      email TEXT,
      first_name TEXT,
      last_name TEXT,
      tags TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await runD1Query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_d1_customers_shop_customer
    ON shopify_customers(shop_domain, customer_id)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_customers_shop_email
    ON shopify_customers(shop_domain, email)
  `);
  await runD1Query(`
    CREATE INDEX IF NOT EXISTS idx_d1_customers_shop_external
    ON shopify_customers(shop_domain, external_id)
  `);

  schemaReady = true;
};

export type D1UpsertCustomerInput = {
  shopDomain: string;
  customerId: string | null;
  externalId: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  tags: string | null;
};

export const d1UpsertCustomer = async (input: D1UpsertCustomerInput) => {
  await ensureD1CustomersSchema();
  const nowIso = new Date().toISOString();

  if (input.customerId) {
    await runD1Query(
      `
        INSERT INTO shopify_customers (
          shop_domain, customer_id, external_id, email, first_name, last_name, tags, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(shop_domain, customer_id) DO UPDATE SET
          external_id = COALESCE(excluded.external_id, shopify_customers.external_id),
          email = COALESCE(excluded.email, shopify_customers.email),
          first_name = COALESCE(excluded.first_name, shopify_customers.first_name),
          last_name = COALESCE(excluded.last_name, shopify_customers.last_name),
          tags = COALESCE(excluded.tags, shopify_customers.tags),
          updated_at = excluded.updated_at
      `,
      [
        input.shopDomain,
        input.customerId,
        input.externalId,
        input.email,
        input.firstName,
        input.lastName,
        input.tags,
        nowIso,
        nowIso,
      ],
    );
    return;
  }

  // Email-only customer (no Shopify customer id): append, matching the Neon path.
  await runD1Query(
    `
      INSERT INTO shopify_customers (
        shop_domain, customer_id, external_id, email, first_name, last_name, tags, created_at, updated_at
      )
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.shopDomain,
      input.externalId,
      input.email,
      input.firstName,
      input.lastName,
      input.tags,
      nowIso,
      nowIso,
    ],
  );
};

/**
 * external_id -> tags map for customers that have tags. Used by customer-tag
 * segmentation: the caller pulls subscriber (id, external_id) pairs from Neon
 * and intersects against this map, reproducing the old subscribers JOIN.
 */
export const d1GetCustomerTagsMap = async (shopDomain: string): Promise<Map<string, string>> => {
  await ensureD1CustomersSchema();

  const rows = await runD1Query(
    `
      SELECT external_id, tags
      FROM shopify_customers
      WHERE shop_domain = ?
        AND external_id IS NOT NULL
        AND tags IS NOT NULL
        AND tags <> ''
    `,
    [shopDomain],
  );

  const map = new Map<string, string>();
  for (const row of rows as Array<Record<string, unknown>>) {
    const externalId = String(row.external_id ?? '');
    const tags = String(row.tags ?? '');
    if (externalId && tags) {
      map.set(externalId, tags);
    }
  }
  return map;
};

export const d1GetDistinctCustomerTags = async (
  shopDomain: string,
  limit = 500,
): Promise<string[]> => {
  await ensureD1CustomersSchema();

  const rows = await runD1Query(
    `
      SELECT tags
      FROM shopify_customers
      WHERE shop_domain = ?
        AND tags IS NOT NULL
        AND tags <> ''
    `,
    [shopDomain],
  );

  const unique = new Set<string>();
  for (const row of rows as Array<Record<string, unknown>>) {
    const blob = String(row.tags ?? '');
    for (const tag of blob.split(',')) {
      const trimmed = tag.trim();
      if (trimmed) {
        unique.add(trimmed);
      }
    }
  }

  return Array.from(unique)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, limit);
};

export const d1CountCustomers = async (shopDomain?: string): Promise<number> => {
  await ensureD1CustomersSchema();

  const rows = shopDomain
    ? await runD1Query(
        `SELECT COUNT(*) AS count FROM shopify_customers WHERE shop_domain = ?`,
        [shopDomain],
      )
    : await runD1Query(`SELECT COUNT(*) AS count FROM shopify_customers`);

  const first = (rows as Array<Record<string, unknown>>)[0];
  return first ? Number(first.count ?? 0) : 0;
};

// Builds the "(customer_id = ? OR LOWER(email) = ?)" predicate honoring whichever
// identifiers were supplied. Email params are expected pre-lowercased by callers.
const buildIdentityClause = (customerId: string | null, email: string | null) => {
  const clauses: string[] = [];
  const params: unknown[] = [];
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

export const d1GetLinkedCustomerExternalIds = async (
  shopDomain: string,
  identity: { customerId: string | null; email: string | null },
  limit = 25,
): Promise<Array<{ external_id: string | null }>> => {
  const { clause, params, hasAny } = buildIdentityClause(identity.customerId, identity.email);
  if (!hasAny) {
    return [];
  }

  await ensureD1CustomersSchema();

  const rows = await runD1Query(
    `
      SELECT external_id
      FROM shopify_customers
      WHERE shop_domain = ?
        AND external_id IS NOT NULL
        AND (${clause})
      ORDER BY updated_at DESC
      LIMIT ?
    `,
    [shopDomain, ...params, limit],
  );

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    external_id: row.external_id == null ? null : String(row.external_id),
  }));
};

export type D1ComplianceCustomerRow = {
  customer_id: string | null;
  external_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  tags: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export const d1GetCustomersForCompliance = async (
  shopDomain: string,
  identity: { customerId: string | null; email: string | null },
): Promise<D1ComplianceCustomerRow[]> => {
  const { clause, params, hasAny } = buildIdentityClause(identity.customerId, identity.email);
  if (!hasAny) {
    return [];
  }

  await ensureD1CustomersSchema();

  const rows = await runD1Query(
    `
      SELECT customer_id, external_id, email, first_name, last_name, tags, created_at, updated_at
      FROM shopify_customers
      WHERE shop_domain = ?
        AND (${clause})
    `,
    [shopDomain, ...params],
  );

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    customer_id: row.customer_id == null ? null : String(row.customer_id),
    external_id: row.external_id == null ? null : String(row.external_id),
    email: row.email == null ? null : String(row.email),
    first_name: row.first_name == null ? null : String(row.first_name),
    last_name: row.last_name == null ? null : String(row.last_name),
    tags: row.tags == null ? null : String(row.tags),
    created_at: row.created_at == null ? null : String(row.created_at),
    updated_at: row.updated_at == null ? null : String(row.updated_at),
  }));
};

export const d1DeleteCustomers = async (
  shopDomain: string,
  identity: { customerId: string | null; email: string | null },
) => {
  const { clause, params, hasAny } = buildIdentityClause(identity.customerId, identity.email);
  if (!hasAny) {
    return;
  }

  await ensureD1CustomersSchema();

  await runD1Query(
    `
      DELETE FROM shopify_customers
      WHERE shop_domain = ?
        AND (${clause})
    `,
    [shopDomain, ...params],
  );
};

export const d1DeleteAllCustomersForShop = async (shopDomain: string) => {
  await ensureD1CustomersSchema();
  await runD1Query(`DELETE FROM shopify_customers WHERE shop_domain = ?`, [shopDomain]);
};
