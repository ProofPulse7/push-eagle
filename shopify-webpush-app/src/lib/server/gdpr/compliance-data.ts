import { getNeonSql } from '@/lib/integrations/database/neon';
import { invalidateStoredShopifyAccessToken } from '@/lib/server/billing/refresh-shopify-session';
import { purgeStalePrismaSessionForShop } from '@/lib/server/billing/shopify-offline-token-refresh';
import { ensureMerchantAccount } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

type GdprCustomer = {
  id?: number | string;
  email?: string | null;
  phone?: string | null;
};

let gdprSchemaReady = false;

const ensureGdprSchema = async () => {
  if (gdprSchemaReady) {
    return;
  }

  const sql = getNeonSql();
  await sql`
    CREATE TABLE IF NOT EXISTS gdpr_data_exports (
      id BIGSERIAL PRIMARY KEY,
      shop_domain TEXT NOT NULL,
      customer_id TEXT,
      customer_email TEXT,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_gdpr_data_exports_shop_created
    ON gdpr_data_exports(shop_domain, created_at DESC)
  `;
  gdprSchemaReady = true;
};

export const storeGdprDataExport = async (input: {
  shopDomain: string;
  customer: GdprCustomer;
  payload: Record<string, unknown>;
}) => {
  await ensureGdprSchema();
  const sql = getNeonSql();
  const rows = await sql`
    INSERT INTO gdpr_data_exports (shop_domain, customer_id, customer_email, payload)
    VALUES (
      ${input.shopDomain},
      ${input.customer.id != null ? String(input.customer.id) : null},
      ${input.customer.email?.trim().toLowerCase() ?? null},
      ${JSON.stringify(input.payload)}::jsonb
    )
    RETURNING id, created_at
  `;

  return {
    exportId: Number(rows[0]?.id ?? 0),
    createdAt: String(rows[0]?.created_at ?? new Date().toISOString()),
  };
};

const customerIdString = (customer: GdprCustomer) =>
  customer.id != null ? String(customer.id) : null;

const customerEmail = (customer: GdprCustomer) =>
  customer.email?.trim().toLowerCase() || null;

export const exportCustomerGdprData = async (
  shopDomainInput: string,
  customer: GdprCustomer,
  ordersRequested: string[] = [],
) => {
  const shopDomain = parseShopDomain(shopDomainInput);
  await ensureMerchantAccount(shopDomain);
  const sql = getNeonSql();
  const customerId = customerIdString(customer);
  const email = customerEmail(customer);

  const shopifyCustomers = await sql`
    SELECT customer_id, external_id, email, first_name, last_name, tags, created_at, updated_at
    FROM shopify_customers
    WHERE shop_domain = ${shopDomain}
      AND (
        (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
        OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
      )
  `;

  const subscribers = await sql`
    SELECT id, external_id, browser, platform, locale, country, city, created_at, last_seen_at
    FROM subscribers
    WHERE shop_domain = ${shopDomain}
      AND (
        (${customerId}::text IS NOT NULL AND external_id = ${customerId})
        OR id IN (
          SELECT subscriber_id
          FROM shopify_orders
          WHERE shop_domain = ${shopDomain}
            AND subscriber_id IS NOT NULL
            AND (
              (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
              OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
            )
        )
      )
  `;

  const orders =
    ordersRequested.length > 0
      ? await sql`
          SELECT order_id, customer_id, email, total_price_cents, created_at
          FROM shopify_orders
          WHERE shop_domain = ${shopDomain}
            AND order_id = ANY(${ordersRequested})
        `
      : await sql`
          SELECT order_id, customer_id, email, total_price_cents, created_at
          FROM shopify_orders
          WHERE shop_domain = ${shopDomain}
            AND (
              (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
              OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
            )
        `;

  return {
    shopDomain,
    customer,
    shopifyCustomers,
    subscribers,
    orders,
    exportedAt: new Date().toISOString(),
  };
};

export const redactCustomerGdprData = async (
  shopDomainInput: string,
  customer: GdprCustomer,
  ordersToRedact: string[] = [],
) => {
  const shopDomain = parseShopDomain(shopDomainInput);
  await ensureMerchantAccount(shopDomain);
  const sql = getNeonSql();
  const customerId = customerIdString(customer);
  const email = customerEmail(customer);

  const subscriberRows =
    ordersToRedact.length > 0
      ? await sql`
          SELECT id
          FROM subscribers
          WHERE shop_domain = ${shopDomain}
            AND (
              (${customerId}::text IS NOT NULL AND external_id = ${customerId})
              OR id IN (
                SELECT subscriber_id
                FROM shopify_orders
                WHERE shop_domain = ${shopDomain}
                  AND subscriber_id IS NOT NULL
                  AND (
                    order_id = ANY(${ordersToRedact})
                    OR (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
                    OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
                  )
              )
            )
        `
      : await sql`
          SELECT id
          FROM subscribers
          WHERE shop_domain = ${shopDomain}
            AND (
              (${customerId}::text IS NOT NULL AND external_id = ${customerId})
              OR id IN (
                SELECT subscriber_id
                FROM shopify_orders
                WHERE shop_domain = ${shopDomain}
                  AND subscriber_id IS NOT NULL
                  AND (
                    (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
                    OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
                  )
              )
            )
        `;

  const subscriberIds = subscriberRows.map((row) => Number(row.id)).filter(Number.isFinite);

  if (subscriberIds.length > 0) {
    await sql`
      DELETE FROM subscriber_activity_events
      WHERE shop_domain = ${shopDomain}
        AND external_id IN (
          SELECT external_id FROM subscribers
          WHERE shop_domain = ${shopDomain}
            AND id = ANY(${subscriberIds})
        )
    `;

    await sql`
      DELETE FROM pixel_events
      WHERE shop_domain = ${shopDomain}
        AND external_id IN (
          SELECT external_id FROM subscribers
          WHERE shop_domain = ${shopDomain}
            AND id = ANY(${subscriberIds})
        )
    `;

    await sql`DELETE FROM subscribers WHERE shop_domain = ${shopDomain} AND id = ANY(${subscriberIds})`;
  }

  if (ordersToRedact.length > 0) {
    await sql`
      DELETE FROM shopify_order_items
      WHERE shop_domain = ${shopDomain}
        AND order_id = ANY(${ordersToRedact})
    `;
    await sql`
      DELETE FROM shopify_orders
      WHERE shop_domain = ${shopDomain}
        AND order_id = ANY(${ordersToRedact})
    `;
  } else {
    await sql`
      DELETE FROM shopify_order_items
      WHERE shop_domain = ${shopDomain}
        AND order_id IN (
          SELECT order_id
          FROM shopify_orders
          WHERE shop_domain = ${shopDomain}
            AND (
              (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
              OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
            )
        )
    `;
    await sql`
      DELETE FROM shopify_orders
      WHERE shop_domain = ${shopDomain}
        AND (
          (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
          OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
        )
    `;
  }

  await sql`
    DELETE FROM shopify_customers
    WHERE shop_domain = ${shopDomain}
      AND (
        (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
        OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
      )
  `;

  return {
    shopDomain,
    redactedSubscriberCount: subscriberIds.length,
    redactedAt: new Date().toISOString(),
  };
};

export const purgeShopGdprData = async (shopDomainInput: string) => {
  const shopDomain = parseShopDomain(shopDomainInput);

  await invalidateStoredShopifyAccessToken(shopDomain);
  await deleteShopifyStoreCredentials(shopDomain);
  await purgeStalePrismaSessionForShop(shopDomain);

  const sql = getNeonSql();
  await ensureGdprSchema();
  await sql`DELETE FROM gdpr_data_exports WHERE shop_domain = ${shopDomain}`;
  await sql`DELETE FROM merchant_billing WHERE shop_domain = ${shopDomain}`;
  await sql`DELETE FROM merchants WHERE shop_domain = ${shopDomain}`;

  return {
    shopDomain,
    purged: true,
    purgedAt: new Date().toISOString(),
  };
};
