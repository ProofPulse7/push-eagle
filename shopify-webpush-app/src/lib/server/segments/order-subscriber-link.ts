import { createHash } from 'crypto';

import { getNeonSql } from '@/lib/integrations/database/neon';
import { getCustomerExternalId } from '@/lib/server/storefront-identity';

const emailExternalId = (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();
  const digest = createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 24);
  return `email:${digest}`;
};

const collectCandidateExternalIds = async (
  shopDomain: string,
  input: {
    externalId?: string | null;
    customerId?: string | null;
    email?: string | null;
  },
) => {
  const candidates = new Set<string>();
  const normalizedExternalId = input.externalId?.trim() || null;
  const normalizedCustomerId = input.customerId?.trim() || null;
  const normalizedEmail = input.email?.trim().toLowerCase() || null;

  if (normalizedExternalId) {
    candidates.add(normalizedExternalId);
  }

  const customerExternalId = getCustomerExternalId({
    customerId: normalizedCustomerId,
    email: normalizedEmail,
  });
  if (customerExternalId) {
    candidates.add(customerExternalId);
  }

  const { isD1CustomersEnabled, d1GetLinkedCustomerExternalIds } = await import(
    '@/lib/server/integrations/d1-customers'
  );
  const sql = getNeonSql();

  const linkedExternalRows = isD1CustomersEnabled()
    ? await d1GetLinkedCustomerExternalIds(shopDomain, {
        customerId: normalizedCustomerId,
        email: normalizedEmail,
      })
    : await (async () => {
        if (normalizedCustomerId && normalizedEmail) {
          return sql`
            SELECT external_id
            FROM shopify_customers
            WHERE shop_domain = ${shopDomain}
              AND external_id IS NOT NULL
              AND (customer_id = ${normalizedCustomerId} OR LOWER(email) = ${normalizedEmail})
            ORDER BY updated_at DESC
            LIMIT 25
          `;
        }
        if (normalizedCustomerId) {
          return sql`
            SELECT external_id
            FROM shopify_customers
            WHERE shop_domain = ${shopDomain}
              AND external_id IS NOT NULL
              AND customer_id = ${normalizedCustomerId}
            ORDER BY updated_at DESC
            LIMIT 25
          `;
        }
        if (normalizedEmail) {
          return sql`
            SELECT external_id
            FROM shopify_customers
            WHERE shop_domain = ${shopDomain}
              AND external_id IS NOT NULL
              AND LOWER(email) = ${normalizedEmail}
            ORDER BY updated_at DESC
            LIMIT 25
          `;
        }
        return [] as Array<{ external_id: string | null }>;
      })();

  for (const row of linkedExternalRows) {
    const externalId = row.external_id == null ? null : String(row.external_id).trim();
    if (externalId) {
      candidates.add(externalId);
    }
  }

  const { isD1CommerceEnabled, d1GetHistoricalOrderExternalIds } = await import(
    '@/lib/server/integrations/d1-commerce'
  );
  const historicalOrderExternalRows = isD1CommerceEnabled()
    ? await d1GetHistoricalOrderExternalIds({
        shopDomain,
        customerId: normalizedCustomerId,
        email: normalizedEmail,
      })
    : await (async () => {
        if (!normalizedCustomerId && !normalizedEmail) {
          return [] as Array<{ external_id: string | null }>;
        }
        if (normalizedCustomerId && normalizedEmail) {
          return sql`
            SELECT external_id
            FROM shopify_orders
            WHERE shop_domain = ${shopDomain}
              AND external_id IS NOT NULL
              AND external_id <> ''
              AND (customer_id = ${normalizedCustomerId} OR LOWER(email) = ${normalizedEmail})
            ORDER BY created_at DESC
            LIMIT 25
          `;
        }
        if (normalizedCustomerId) {
          return sql`
            SELECT external_id
            FROM shopify_orders
            WHERE shop_domain = ${shopDomain}
              AND external_id IS NOT NULL
              AND external_id <> ''
              AND customer_id = ${normalizedCustomerId}
            ORDER BY created_at DESC
            LIMIT 25
          `;
        }
        return sql`
          SELECT external_id
          FROM shopify_orders
          WHERE shop_domain = ${shopDomain}
            AND external_id IS NOT NULL
            AND external_id <> ''
            AND LOWER(email) = ${normalizedEmail}
          ORDER BY created_at DESC
          LIMIT 25
        `;
      })();

  for (const row of historicalOrderExternalRows) {
    const externalId = row.external_id == null ? null : String(row.external_id).trim();
    if (externalId) {
      candidates.add(externalId);
    }
  }

  if (normalizedEmail) {
    candidates.add(emailExternalId(normalizedEmail));
  }
  if (normalizedCustomerId) {
    candidates.add(`shopify_customer:${normalizedCustomerId}`);
  }

  return [...candidates];
};

export const resolveSubscriberIdForOrder = async (
  shopDomain: string,
  input: {
    externalId?: string | null;
    customerId?: string | null;
    email?: string | null;
  },
) => {
  const candidateExternalIds = await collectCandidateExternalIds(shopDomain, input);
  if (candidateExternalIds.length === 0) {
    return null;
  }

  const { audienceRead, d1GetSubscriberIdByExternalId } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  const sql = getNeonSql();

  for (const externalId of candidateExternalIds) {
    const subscriberId = await audienceRead<number | null>({
      label: 'resolveSubscriberIdForOrder',
      key: (value) => String(value ?? 'null'),
      neon: async () => {
        const rows = await sql`
          SELECT id
          FROM subscribers
          WHERE shop_domain = ${shopDomain}
            AND external_id = ${externalId}
          LIMIT 1
        `;
        return rows[0]?.id ? Number(rows[0].id) : null;
      },
      d1: async () => d1GetSubscriberIdByExternalId(shopDomain, externalId),
    });

    if (subscriberId) {
      return subscriberId;
    }
  }

  return null;
};

export const backfillOrderSubscriberLinks = async (shopDomain: string) => {
  const sql = getNeonSql();
  const { isD1CommerceEnabled, d1BackfillOrderSubscriberLinks } = await import(
    '@/lib/server/integrations/d1-commerce'
  );

  if (isD1CommerceEnabled()) {
    await d1BackfillOrderSubscriberLinks(shopDomain);
  }

  await sql`
    UPDATE shopify_orders o
    SET subscriber_id = s.id
    FROM subscribers s
    WHERE o.shop_domain = ${shopDomain}
      AND o.subscriber_id IS NULL
      AND s.shop_domain = o.shop_domain
      AND o.external_id IS NOT NULL
      AND o.external_id <> ''
      AND s.external_id = o.external_id
  `;

  await sql`
    UPDATE shopify_orders o
    SET subscriber_id = s.id
    FROM subscribers s
    WHERE o.shop_domain = ${shopDomain}
      AND o.subscriber_id IS NULL
      AND s.shop_domain = o.shop_domain
      AND o.customer_id IS NOT NULL
      AND s.external_id = 'shopify_customer:' || o.customer_id
  `;

  await sql`
    UPDATE shopify_orders o
    SET subscriber_id = s.id
    FROM subscribers s
    WHERE o.shop_domain = ${shopDomain}
      AND o.subscriber_id IS NULL
      AND s.shop_domain = o.shop_domain
      AND o.email IS NOT NULL
      AND TRIM(o.email) <> ''
      AND s.external_id = 'email:' || SUBSTRING(ENCODE(DIGEST(LOWER(TRIM(o.email)), 'sha256'), 'hex') FROM 1 FOR 24)
  `;

  await sql`
    UPDATE shopify_orders o
    SET subscriber_id = s.id
    FROM shopify_customers c
    JOIN subscribers s
      ON s.shop_domain = c.shop_domain
     AND s.external_id = c.external_id
    WHERE o.shop_domain = ${shopDomain}
      AND o.subscriber_id IS NULL
      AND c.shop_domain = o.shop_domain
      AND c.external_id IS NOT NULL
      AND (
        (o.customer_id IS NOT NULL AND c.customer_id = o.customer_id)
        OR (o.email IS NOT NULL AND LOWER(c.email) = LOWER(o.email))
      )
  `;
};
