/**
 * Pixel Events Logger
 * Raw event ingestion and processing for write-optimized logging
 * Handles millions of events efficiently
 */

import { randomUUID } from 'crypto';
import { getNeonSql } from '@/lib/integrations/database/neon';

export type PixelEvent = {
  shopDomain: string;
  externalId: string;
  eventType: 'page_view' | 'product_view' | 'add_to_cart' | 'checkout_start';
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
 * Archive old pixel events (cleanup)
 * Move events older than 90 days to archive or delete
 */
export const archiveOldPixelEvents = async (daysOld = 90) => {
  const sql = getNeonSql();

  const result = await sql`
    DELETE FROM pixel_events
    WHERE created_at < NOW() - INTERVAL '${daysOld} days'
    RETURNING id
  `;

  return result.length;
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
