import { getNeonSql } from '@/lib/integrations/database/neon';
import { invalidateStoredShopifyAccessToken } from '@/lib/server/billing/refresh-shopify-session';
import { deleteShopifyStoreCredentials } from '@/lib/server/billing/shopify-credentials-store';
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

  const { isD1CustomersEnabled, d1GetCustomersForCompliance } = await import(
    '@/lib/server/integrations/d1-customers'
  );
  const shopifyCustomers = isD1CustomersEnabled()
    ? await d1GetCustomersForCompliance(shopDomain, { customerId, email })
    : await sql`
      SELECT customer_id, external_id, email, first_name, last_name, tags, created_at, updated_at
      FROM shopify_customers
      WHERE shop_domain = ${shopDomain}
        AND (
          (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
          OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
        )
    `;

  const { isD1CommerceEnabled, d1GetOrderSubscriberIdsForCompliance, d1GetOrdersForCompliance } =
    await import('@/lib/server/integrations/d1-commerce');
  const commerceOnD1 = isD1CommerceEnabled();

  // Subscriber ids linked through orders (by customer/email), read from wherever
  // orders live. Used to include order-linked subscribers in the export.
  const orderLinkedSubscriberIds = commerceOnD1
    ? await d1GetOrderSubscriberIdsForCompliance(shopDomain, { customerId, email })
    : (
        await sql`
          SELECT DISTINCT subscriber_id
          FROM shopify_orders
          WHERE shop_domain = ${shopDomain}
            AND subscriber_id IS NOT NULL
            AND (
              (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
              OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
            )
        `
      )
        .map((row) => Number(row.subscriber_id))
        .filter((id) => Number.isFinite(id));

  const { isD1AudienceReadActive, d1GetGdprSubscriberRows } = await import(
    '@/lib/server/integrations/d1-audience'
  );

  const subscribers = isD1AudienceReadActive()
    ? await d1GetGdprSubscriberRows(shopDomain, {
        externalId: customerId,
        extraIds: orderLinkedSubscriberIds,
      })
    : await sql`
      SELECT id, external_id, browser, platform, locale, country, city, created_at, last_seen_at
      FROM subscribers
      WHERE shop_domain = ${shopDomain}
        AND (
          (${customerId}::text IS NOT NULL AND external_id = ${customerId})
          OR id = ANY(${orderLinkedSubscriberIds})
        )
    `;

  const orderScope =
    ordersRequested.length > 0
      ? { ordersRequested, customerId: null, email: null }
      : { customerId, email };
  const orders = commerceOnD1
    ? await d1GetOrdersForCompliance(shopDomain, orderScope)
    : ordersRequested.length > 0
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

  const {
    isD1AudienceReadActive,
    isD1AudienceWriteEnabled,
    d1GetGdprSubscriberRows,
    d1DeleteSubscribersByIds,
  } = await import('@/lib/server/integrations/d1-audience');
  const readActive = isD1AudienceReadActive();

  let subscriberIds: number[] = [];
  // In read/d1_only, resolve the subscriber external_ids from D1 so the activity /
  // pixel purge can target them directly (Neon no longer has the subscriber rows).
  let subscriberExternalIds: string[] | null = null;

  const { isD1CommerceEnabled, d1GetOrderSubscriberIdsForCompliance, d1DeleteOrders } =
    await import('@/lib/server/integrations/d1-commerce');
  const commerceOnD1 = isD1CommerceEnabled();

  // Subscriber ids linked through the redacted orders (order ids OR customer/email),
  // read from wherever orders live. An empty ordersToRedact makes `order_id = ANY('{}')`
  // false, collapsing to the customer/email match exactly like the old else-branch.
  const orderLinkedSubscriberIds = commerceOnD1
    ? await d1GetOrderSubscriberIdsForCompliance(shopDomain, {
        ordersRequested: ordersToRedact,
        customerId,
        email,
      })
    : (
        await sql`
          SELECT DISTINCT subscriber_id
          FROM shopify_orders
          WHERE shop_domain = ${shopDomain}
            AND subscriber_id IS NOT NULL
            AND (
              order_id = ANY(${ordersToRedact})
              OR (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
              OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
            )
        `
      )
        .map((row) => Number(row.subscriber_id))
        .filter((id) => Number.isFinite(id));

  if (readActive) {
    const d1Rows = await d1GetGdprSubscriberRows(shopDomain, {
      externalId: customerId,
      extraIds: orderLinkedSubscriberIds,
    });
    subscriberIds = d1Rows.map((row) => Number(row.id)).filter(Number.isFinite);
    subscriberExternalIds = Array.from(
      new Set(d1Rows.map((row) => row.external_id).filter((value): value is string => Boolean(value))),
    );
  } else {
    const subscriberRows = await sql`
      SELECT id
      FROM subscribers
      WHERE shop_domain = ${shopDomain}
        AND (
          (${customerId}::text IS NOT NULL AND external_id = ${customerId})
          OR id = ANY(${orderLinkedSubscriberIds})
        )
    `;
    subscriberIds = subscriberRows.map((row) => Number(row.id)).filter(Number.isFinite);
  }

  if (subscriberIds.length > 0) {
    if (readActive) {
      if (subscriberExternalIds && subscriberExternalIds.length > 0) {
        await sql`
          DELETE FROM subscriber_activity_events
          WHERE shop_domain = ${shopDomain}
            AND external_id = ANY(${subscriberExternalIds})
        `;
        await sql`
          DELETE FROM pixel_events
          WHERE shop_domain = ${shopDomain}
            AND external_id = ANY(${subscriberExternalIds})
        `;
      }
    } else {
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
    }

    await sql`DELETE FROM subscribers WHERE shop_domain = ${shopDomain} AND id = ANY(${subscriberIds})`;

    if (isD1AudienceWriteEnabled()) {
      await d1DeleteSubscribersByIds(shopDomain, subscriberIds);
    }
  }

  if (commerceOnD1) {
    // Same exclusive semantics as Neon: redact by order ids when provided, else by
    // customer/email. d1DeleteOrders removes the child items first (no FK cascade).
    await d1DeleteOrders(
      shopDomain,
      ordersToRedact.length > 0
        ? { ordersRequested: ordersToRedact, customerId: null, email: null }
        : { customerId, email },
    );
  } else if (ordersToRedact.length > 0) {
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

  const { isD1CustomersEnabled, d1DeleteCustomers } = await import(
    '@/lib/server/integrations/d1-customers'
  );
  if (isD1CustomersEnabled()) {
    await d1DeleteCustomers(shopDomain, { customerId, email });
  } else {
    await sql`
      DELETE FROM shopify_customers
      WHERE shop_domain = ${shopDomain}
        AND (
          (${customerId}::text IS NOT NULL AND customer_id = ${customerId})
          OR (${email}::text IS NOT NULL AND LOWER(COALESCE(email, '')) = ${email})
        )
    `;
  }

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
  // Deleting the merchant cascades Neon-owned rows, but the D1 customer cache is
  // outside that cascade, so purge it explicitly for full GDPR erasure.
  const { isD1CustomersEnabled, d1DeleteAllCustomersForShop } = await import(
    '@/lib/server/integrations/d1-customers'
  );
  if (isD1CustomersEnabled()) {
    await d1DeleteAllCustomersForShop(shopDomain);
  }
  // Same reasoning for the D1 audience mirror (subscribers + tokens).
  const { isD1AudienceWriteEnabled, d1DeleteAllAudienceForShop } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  if (isD1AudienceWriteEnabled()) {
    await d1DeleteAllAudienceForShop(shopDomain);
  }
  // And the D1 commerce cache (orders / order_items / fulfillments).
  const { isD1CommerceEnabled, d1DeleteAllCommerceForShop } = await import(
    '@/lib/server/integrations/d1-commerce'
  );
  if (isD1CommerceEnabled()) {
    await d1DeleteAllCommerceForShop(shopDomain);
  }
  await sql`DELETE FROM merchants WHERE shop_domain = ${shopDomain}`;

  return {
    shopDomain,
    purged: true,
    purgedAt: new Date().toISOString(),
  };
};
