/**
 * Neon tables that are fully migrated to Cloudflare D1 / KV. When the
 * corresponding feature flag is on and the table is empty, they can be dropped
 * to reclaim Neon storage. ensureSchema() skips creating them once cut over.
 */

import { isCloudflareKvEnabled } from '@/lib/server/cache/cloudflare-kv';
import { isD1CatalogEnabled } from '@/lib/server/integrations/d1-catalog';
import { isD1CommerceEnabled } from '@/lib/server/integrations/d1-commerce';
import { isD1CustomersEnabled } from '@/lib/server/integrations/d1-customers';
import { isD1DeliveriesEnabled } from '@/lib/server/integrations/d1-deliveries';
import { isD1EventsEnabled } from '@/lib/server/integrations/d1-events';
import { getNeonSql } from '@/lib/integrations/database/neon';

export type NeonLegacySchemaSkip = {
  deliveries: boolean;
  commerce: boolean;
  customers: boolean;
  catalog: boolean;
  events: boolean;
  webhooks: boolean;
};

export type NeonLegacyTableGroup = {
  key: keyof NeonLegacySchemaSkip;
  label: string;
  tables: string[];
};

export const NEON_LEGACY_TABLE_GROUPS: NeonLegacyTableGroup[] = [
  {
    key: 'deliveries',
    label: 'Delivery / click detail (D1 deliveries)',
    tables: [
      'campaign_deliveries',
      'campaign_clicks',
      'automation_deliveries',
      'automation_clicks',
    ],
  },
  {
    key: 'commerce',
    label: 'Shopify order cache (D1 commerce)',
    tables: ['shopify_order_items', 'shopify_orders', 'shopify_fulfillments'],
  },
  {
    key: 'customers',
    label: 'Shopify customers cache (D1 customers)',
    tables: ['shopify_customers'],
  },
  {
    key: 'catalog',
    label: 'Product variants cache (D1 catalog)',
    tables: ['shopify_product_variants'],
  },
  {
    key: 'events',
    label: 'Pixel / activity events (D1 events)',
    tables: ['pixel_events', 'subscriber_activity_events'],
  },
  {
    key: 'webhooks',
    label: 'Webhook dedup log (Cloudflare KV)',
    tables: ['webhook_events'],
  },
];

const skipFlagForGroup = (key: keyof NeonLegacySchemaSkip): boolean => {
  switch (key) {
    case 'deliveries':
      return isD1DeliveriesEnabled();
    case 'commerce':
      return isD1CommerceEnabled();
    case 'customers':
      return isD1CustomersEnabled();
    case 'catalog':
      return isD1CatalogEnabled();
    case 'events':
      return isD1EventsEnabled();
    case 'webhooks':
      return isCloudflareKvEnabled();
    default:
      return false;
  }
};

/** Which legacy Neon tables should NOT be created during ensureSchema(). */
export const getNeonLegacySchemaSkip = (): NeonLegacySchemaSkip => ({
  deliveries: isD1DeliveriesEnabled(),
  commerce: isD1CommerceEnabled(),
  customers: isD1CustomersEnabled(),
  catalog: isD1CatalogEnabled(),
  events: isD1EventsEnabled(),
  webhooks: isCloudflareKvEnabled(),
});

export const neonTableExists = async (tableName: string): Promise<boolean> => {
  const sql = getNeonSql();
  const rows = await sql`
    SELECT to_regclass(${`public.${tableName}`}) IS NOT NULL AS exists
  `;
  return Boolean(rows[0]?.exists);
};

const ALLOWED_LEGACY_TABLES = new Set(
  NEON_LEGACY_TABLE_GROUPS.flatMap((group) => group.tables),
);

const countLegacyTableRows = async (tableName: string): Promise<number> => {
  if (!ALLOWED_LEGACY_TABLES.has(tableName)) {
    throw new Error(`Unknown legacy table: ${tableName}`);
  }
  const sql = getNeonSql();
  switch (tableName) {
    case 'campaign_deliveries': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM campaign_deliveries`;
      return Number(rows[0]?.count ?? 0);
    }
    case 'campaign_clicks': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM campaign_clicks`;
      return Number(rows[0]?.count ?? 0);
    }
    case 'automation_deliveries': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM automation_deliveries`;
      return Number(rows[0]?.count ?? 0);
    }
    case 'automation_clicks': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM automation_clicks`;
      return Number(rows[0]?.count ?? 0);
    }
    case 'shopify_order_items': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_order_items`;
      return Number(rows[0]?.count ?? 0);
    }
    case 'shopify_orders': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_orders`;
      return Number(rows[0]?.count ?? 0);
    }
    case 'shopify_fulfillments': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_fulfillments`;
      return Number(rows[0]?.count ?? 0);
    }
    case 'shopify_customers': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_customers`;
      return Number(rows[0]?.count ?? 0);
    }
    case 'shopify_product_variants': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_product_variants`;
      return Number(rows[0]?.count ?? 0);
    }
    case 'pixel_events': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM pixel_events`;
      return Number(rows[0]?.count ?? 0);
    }
    case 'subscriber_activity_events': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM subscriber_activity_events`;
      return Number(rows[0]?.count ?? 0);
    }
    case 'webhook_events': {
      const rows = await sql`SELECT COUNT(*)::BIGINT AS count FROM webhook_events`;
      return Number(rows[0]?.count ?? 0);
    }
    default:
      throw new Error(`Unknown legacy table: ${tableName}`);
  }
};

const dropLegacyTable = async (tableName: string): Promise<void> => {
  if (!ALLOWED_LEGACY_TABLES.has(tableName)) {
    throw new Error(`Unknown legacy table: ${tableName}`);
  }
  const sql = getNeonSql();
  switch (tableName) {
    case 'campaign_deliveries':
      await sql`DROP TABLE IF EXISTS campaign_deliveries CASCADE`;
      return;
    case 'campaign_clicks':
      await sql`DROP TABLE IF EXISTS campaign_clicks CASCADE`;
      return;
    case 'automation_deliveries':
      await sql`DROP TABLE IF EXISTS automation_deliveries CASCADE`;
      return;
    case 'automation_clicks':
      await sql`DROP TABLE IF EXISTS automation_clicks CASCADE`;
      return;
    case 'shopify_order_items':
      await sql`DROP TABLE IF EXISTS shopify_order_items CASCADE`;
      return;
    case 'shopify_orders':
      await sql`DROP TABLE IF EXISTS shopify_orders CASCADE`;
      return;
    case 'shopify_fulfillments':
      await sql`DROP TABLE IF EXISTS shopify_fulfillments CASCADE`;
      return;
    case 'shopify_customers':
      await sql`DROP TABLE IF EXISTS shopify_customers CASCADE`;
      return;
    case 'shopify_product_variants':
      await sql`DROP TABLE IF EXISTS shopify_product_variants CASCADE`;
      return;
    case 'pixel_events':
      await sql`DROP TABLE IF EXISTS pixel_events CASCADE`;
      return;
    case 'subscriber_activity_events':
      await sql`DROP TABLE IF EXISTS subscriber_activity_events CASCADE`;
      return;
    case 'webhook_events':
      await sql`DROP TABLE IF EXISTS webhook_events CASCADE`;
      return;
    default:
      throw new Error(`Unknown legacy table: ${tableName}`);
  }
};

export type NeonLegacyTableInventoryRow = {
  table: string;
  group: string;
  exists: boolean;
  rowCount: number | null;
  skipSchema: boolean;
  eligibleToDrop: boolean;
};

export const getNeonLegacyTableInventory = async (): Promise<{
  skip: NeonLegacySchemaSkip;
  tables: NeonLegacyTableInventoryRow[];
}> => {
  const skip = getNeonLegacySchemaSkip();
  const tables: NeonLegacyTableInventoryRow[] = [];

  for (const group of NEON_LEGACY_TABLE_GROUPS) {
    const groupSkip = skip[group.key];
    for (const table of group.tables) {
      const exists = await neonTableExists(table);
      const count = exists ? await countLegacyTableRows(table) : null;
      tables.push({
        table,
        group: group.label,
        exists,
        rowCount: count,
        skipSchema: groupSkip,
        eligibleToDrop: groupSkip && exists && count === 0,
      });
    }
  }

  return { skip, tables };
};

export type DropNeonLegacyTablesResult = {
  dryRun: boolean;
  dropped: string[];
  skipped: Array<{ table: string; reason: string }>;
};

/**
 * DROP empty legacy Neon tables after D1/KV cutover. Refuses to drop any table
 * that still has rows or whose feature flag is off.
 */
export const dropNeonLegacyTablesAfterD1Cutover = async (options?: {
  dryRun?: boolean;
}): Promise<DropNeonLegacyTablesResult> => {
  const dryRun = options?.dryRun === true;
  const dropped: string[] = [];
  const skipped: Array<{ table: string; reason: string }> = [];

  for (const group of NEON_LEGACY_TABLE_GROUPS) {
    if (!skipFlagForGroup(group.key)) {
      for (const table of group.tables) {
        skipped.push({
          table,
          reason: `${group.key} flag not enabled (${group.label})`,
        });
      }
      continue;
    }

    for (const table of group.tables) {
      const exists = await neonTableExists(table);
      if (!exists) {
        skipped.push({ table, reason: 'already absent' });
        continue;
      }

      const count = await countLegacyTableRows(table);
      if (count > 0) {
        skipped.push({ table, reason: `still has ${count} rows` });
        continue;
      }

      if (!dryRun) {
        await dropLegacyTable(table);
      }
      dropped.push(table);
    }
  }

  return { dryRun, dropped, skipped };
};
