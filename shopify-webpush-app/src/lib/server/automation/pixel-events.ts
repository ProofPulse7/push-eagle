/**
 * Pixel Events Logger
 * Raw event ingestion and processing for write-optimized logging
 * Handles millions of events efficiently
 */

import { randomUUID } from 'crypto';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { insertD1PixelEvent, isD1EventsEnabled } from '@/lib/server/integrations/d1-events';

export type PixelEvent = {
  shopDomain: string;
  externalId: string;
  eventType: 'page_view' | 'product_view' | 'add_to_cart' | 'checkout_start' | 'checkout_complete';
  pageUrl?: string | null;
  productId?: string | null;
  cartToken?: string | null;
  clientId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Record raw pixel event to database
 * Fast write with minimal processing
 */
export const recordPixelEvent = async (event: PixelEvent): Promise<string> => {
  const eventId = randomUUID();

  if (isD1EventsEnabled()) {
    await insertD1PixelEvent({
      id: eventId,
      shopDomain: event.shopDomain,
      externalId: event.externalId,
      eventType: event.eventType,
      pageUrl: event.pageUrl,
      productId: event.productId,
      cartToken: event.cartToken,
      clientId: event.clientId,
      metadata: event.metadata,
    });
    return eventId;
  }

  const sql = getNeonSql();

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
      ${event.shopDomain},
      ${event.externalId},
      ${event.eventType},
      ${event.pageUrl ?? null},
      ${event.productId ?? null},
      ${event.cartToken ?? null},
      ${event.clientId ?? null},
      ${JSON.stringify(event.metadata ?? {})}::jsonb,
      NOW()
    )
  `;

  return eventId;
};

/**
 * Get pixel event stats for dashboard
 */
export const getPixelEventStats = async (shopDomain: string, hoursBack = 24) => {
  const sql = getNeonSql();

  const stats = await sql`
    SELECT
      event_type,
      COUNT(*) as count,
      COUNT(DISTINCT external_id) as unique_users,
      COUNT(DISTINCT DATE_TRUNC('hour', created_at)) as hours_active
    FROM pixel_events
    WHERE shop_domain = ${shopDomain}
      AND created_at > NOW() - INTERVAL '${hoursBack} hours'
    GROUP BY event_type
  `;

  return stats.map((row: any) => ({
    eventType: String(row.event_type),
    count: Number(row.count),
    uniqueUsers: Number(row.unique_users),
    hoursActive: Number(row.hours_active),
  }));
};

/**
 * Archive pixel events older than the hot retention window.
 * Hot events stay in Neon for automations (14-day lookback). Older rows move to R2, then delete from Neon.
 */
export const archiveOldPixelEvents = async (hotRetentionDays = 14, batchSize = 2000) => {
  const sql = getNeonSql();
  const cutoff = new Date(Date.now() - hotRetentionDays * 24 * 60 * 60 * 1000);

  const rows = await sql`
    SELECT
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
    FROM pixel_events
    WHERE created_at < ${cutoff}
    ORDER BY created_at ASC
    LIMIT ${batchSize}
  `;

  if (rows.length === 0) {
    return { archived: 0, deleted: 0, objectKeys: [] as string[] };
  }

  const events = rows.map((row) => ({
    id: String(row.id),
    shop_domain: String(row.shop_domain),
    external_id: String(row.external_id),
    event_type: String(row.event_type),
    page_url: row.page_url ? String(row.page_url) : null,
    product_id: row.product_id ? String(row.product_id) : null,
    cart_token: row.cart_token ? String(row.cart_token) : null,
    client_id: row.client_id ? String(row.client_id) : null,
    metadata: row.metadata ?? {},
    created_at: row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString(),
  }));

  let objectKeys: string[] = [];
  const { archivePixelEventsToR2, isPixelArchiveEnabled } = await import('@/lib/server/automation/pixel-archive');
  if (isPixelArchiveEnabled()) {
    const archiveResult = await archivePixelEventsToR2(events);
    objectKeys = archiveResult.objectKeys;
  }

  const ids = events.map((event) => event.id);
  await sql`
    DELETE FROM pixel_events
    WHERE id = ANY(${ids})
  `;

  return {
    archived: events.length,
    deleted: events.length,
    objectKeys,
  };
};

/**
 * Analyze pixel events to find trends
 */
export const analyzePixelEventTrends = async (shopDomain: string, hoursBack = 24) => {
  const sql = getNeonSql();

  const trends = await sql`
    SELECT
      DATE_TRUNC('hour', created_at) as hour,
      event_type,
      COUNT(*) as count,
      COUNT(DISTINCT external_id) as unique_users
    FROM pixel_events
    WHERE shop_domain = ${shopDomain}
      AND created_at > NOW() - INTERVAL '${hoursBack} hours'
    GROUP BY DATE_TRUNC('hour', created_at), event_type
    ORDER BY hour DESC, event_type
  `;

  return trends.map((row: any) => ({
    hour: row.hour ? new Date(row.hour).toISOString() : null,
    eventType: String(row.event_type),
    count: Number(row.count),
    uniqueUsers: Number(row.unique_users),
  }));
};
