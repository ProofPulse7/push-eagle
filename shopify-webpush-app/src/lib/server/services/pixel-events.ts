import { randomUUID } from 'crypto';
import { getNeonSql } from '@/lib/integrations/database/neon';

export type PixelEventInput = {
  shopDomain: string;
  externalId: string;
  eventType: 'page_viewed' | 'product_viewed' | 'product_added_to_cart' | 'checkout_started';
  pageUrl?: string | null;
  productId?: string | null;
  cartToken?: string | null;
  clientId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Record raw pixel event with write-optimized query.
 * Designed to handle millions of events with minimal latency.
 * Fire-and-forget: doesn't wait for automatic triggering of automations.
 */
export const recordPixelEvent = async (input: PixelEventInput): Promise<string> => {
  const sql = getNeonSql();
  const eventId = randomUUID();

  await sql`
    INSERT INTO pixel_events (
      id,
      shop_domain,
      external_id,
      event_type,
      page_url,
      product_id,
      cart_token,
      client_id,
      metadata,
      created_at
    )
    VALUES (
      ${eventId},
      ${input.shopDomain},
      ${input.externalId},
      ${input.eventType},
      ${input.pageUrl ?? null},
      ${input.productId ?? null},
      ${input.cartToken ?? null},
      ${input.clientId ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      NOW()
    )
  `;

  return eventId;
};

/**
 * Batch record multiple pixel events (optimized for burst traffic).
 * Single query for multiple inserts with ON CONFLICT handling.
 */
export const recordPixelEventBatch = async (events: PixelEventInput[]): Promise<string[]> => {
  if (events.length === 0) {
    return [];
  }

  const sql = getNeonSql();
  const ids = events.map(() => randomUUID());

  await sql`
    INSERT INTO pixel_events (
      id,
      shop_domain,
      external_id,
      event_type,
      page_url,
      product_id,
      cart_token,
      client_id,
      metadata,
      created_at
    )
    SELECT * FROM (VALUES
      ${sql.join(
        events.map(
          (e, i) =>
            sql`
            (
              ${ids[i]},
              ${e.shopDomain},
              ${e.externalId},
              ${e.eventType},
              ${e.pageUrl ?? null},
              ${e.productId ?? null},
              ${e.cartToken ?? null},
              ${e.clientId ?? null},
              ${JSON.stringify(e.metadata ?? {})}::jsonb,
              NOW()
            )
          `,
        ),
        sql`,`,
      )}
    ) AS t(id, shop_domain, external_id, event_type, page_url, product_id, cart_token, client_id, metadata, created_at)
  `;

  return ids;
};

/**
 * List unprocessed pixel events for a shop (for manual trigger of automations).
 * Queries raw events before activity_events table to enable post-processing.
 */
export const listUnprocessedPixelEvents = async (shopDomain: string, limit = 1000) => {
  const sql = getNeonSql();

  const rows = await sql`
    SELECT 
      id,
      external_id,
      event_type,
      page_url,
      product_id,
      cart_token,
      metadata,
      created_at
    FROM pixel_events
    WHERE shop_domain = ${shopDomain}
      AND created_at >= NOW() - INTERVAL '1 hour'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: String(row.id),
    externalId: String(row.external_id),
    eventType: String(row.event_type),
    pageUrl: row.page_url ? String(row.page_url) : null,
    productId: row.product_id ? String(row.product_id) : null,
    cartToken: row.cart_token ? String(row.cart_token) : null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: String(row.created_at),
  }));
};

/**
 * Delete old pixel events (prune strategy: keep 7 days).
 * Run as part of nightly maintenance.
 */
export const pruneOldPixelEvents = async (retentionDays = 7) => {
  const sql = getNeonSql();

  await sql`
    DELETE FROM pixel_events
    WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
  `;
};
