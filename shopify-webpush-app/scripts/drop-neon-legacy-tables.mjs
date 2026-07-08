/**
 * Drop empty Neon tables migrated to D1/KV. Safe: only drops when the matching
 * feature flag is on AND the table has zero rows.
 *
 * Usage:
 *   node scripts/drop-neon-legacy-tables.mjs          # dry-run
 *   node scripts/drop-neon-legacy-tables.mjs --confirm  # execute DROP
 */

import fs from 'node:fs';
import path from 'node:path';

import { neon } from '@neondatabase/serverless';

function loadEnvFrom(filePath, force = false) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    if (!key || (!force && process.env[key])) {
      continue;
    }

    const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '');
    process.env[key] = value;
  }
}

const cwd = process.cwd();
const useProduction = process.argv.includes('--production');
if (useProduction) {
  loadEnvFrom(path.resolve(cwd, '.env.production.local'), true);
}
loadEnvFrom(path.resolve(cwd, '.env.local'));
loadEnvFrom(path.resolve(cwd, '.env'));
loadEnvFrom(path.resolve(cwd, '..', '.env'));

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Missing NEON_DATABASE_URL');
}

const sql = neon(databaseUrl);
const confirm = process.argv.includes('--confirm');
const forcePurge = process.argv.includes('--force');
const inventoryOnly = process.argv.includes('--inventory-only');
const productionCutover = useProduction && (confirm || inventoryOnly);

const flagOn = (key) => String(process.env[key] ?? '').toLowerCase() === 'true';
const kvOn = () => Boolean(process.env.CLOUDFLARE_KV_NAMESPACE_ID?.trim());

const GROUPS = [
  {
    key: 'deliveries',
    enabled: () => flagOn('D1_DELIVERIES_ENABLED'),
    tables: [
      'campaign_deliveries',
      'campaign_clicks',
      'automation_deliveries',
      'automation_clicks',
    ],
  },
  {
    key: 'commerce',
    enabled: () => flagOn('D1_COMMERCE_ENABLED'),
    tables: ['shopify_order_items', 'shopify_orders', 'shopify_fulfillments'],
  },
  {
    key: 'customers',
    enabled: () => flagOn('D1_CUSTOMERS_ENABLED'),
    tables: ['shopify_customers'],
  },
  {
    key: 'catalog',
    enabled: () => flagOn('D1_CATALOG_ENABLED'),
    tables: ['shopify_product_variants'],
  },
  {
    key: 'events',
    enabled: () => flagOn('D1_EVENTS_ENABLED'),
    tables: ['pixel_events', 'subscriber_activity_events'],
  },
  {
    key: 'webhooks',
    enabled: () => kvOn(),
    tables: ['webhook_events'],
  },
  {
    key: 'audience',
    enabled: () => String(process.env.D1_AUDIENCE_MODE ?? '').toLowerCase() === 'd1_only',
    tables: ['subscriber_tokens', 'subscribers'],
  },
];

const tableExists = async (table) => {
  const rows = await sql`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS exists`;
  return Boolean(rows[0]?.exists);
};

const countRows = async (table) => {
  switch (table) {
    case 'campaign_deliveries':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM campaign_deliveries`)[0]?.count ?? 0);
    case 'campaign_clicks':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM campaign_clicks`)[0]?.count ?? 0);
    case 'automation_deliveries':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM automation_deliveries`)[0]?.count ?? 0);
    case 'automation_clicks':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM automation_clicks`)[0]?.count ?? 0);
    case 'shopify_order_items':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_order_items`)[0]?.count ?? 0);
    case 'shopify_orders':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_orders`)[0]?.count ?? 0);
    case 'shopify_fulfillments':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_fulfillments`)[0]?.count ?? 0);
    case 'shopify_customers':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_customers`)[0]?.count ?? 0);
    case 'shopify_product_variants':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_product_variants`)[0]?.count ?? 0);
    case 'pixel_events':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM pixel_events`)[0]?.count ?? 0);
    case 'subscriber_activity_events':
      return Number(
        (await sql`SELECT COUNT(*)::BIGINT AS count FROM subscriber_activity_events`)[0]?.count ?? 0,
      );
    case 'webhook_events':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM webhook_events`)[0]?.count ?? 0);
    case 'subscriber_tokens':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM subscriber_tokens`)[0]?.count ?? 0);
    case 'subscribers':
      return Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM subscribers`)[0]?.count ?? 0);
    default:
      throw new Error(`Unknown table: ${table}`);
  }
};

const dropTable = async (table) => {
  switch (table) {
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
    case 'subscriber_tokens':
      await sql`DROP TABLE IF EXISTS subscriber_tokens CASCADE`;
      return;
    case 'subscribers':
      await sql`DROP TABLE IF EXISTS subscribers CASCADE`;
      return;
    default:
      throw new Error(`Unknown table: ${table}`);
  }
};

const main = async () => {
  console.log(confirm ? (forcePurge ? 'FORCE DROP mode' : 'DROP mode (--confirm)') : 'DRY RUN (pass --confirm to drop)');
  console.log('Flags:', {
    D1_AUDIENCE_MODE: String(process.env.D1_AUDIENCE_MODE ?? ''),
    D1_DELIVERIES_ENABLED: flagOn('D1_DELIVERIES_ENABLED'),
    D1_COMMERCE_ENABLED: flagOn('D1_COMMERCE_ENABLED'),
    D1_CUSTOMERS_ENABLED: flagOn('D1_CUSTOMERS_ENABLED'),
    D1_CATALOG_ENABLED: flagOn('D1_CATALOG_ENABLED'),
    D1_EVENTS_ENABLED: flagOn('D1_EVENTS_ENABLED'),
    KV: kvOn(),
    forcePurge,
  });

  const dropped = [];
  const skipped = [];

  for (const group of GROUPS) {
    if (!group.enabled() && !productionCutover && !inventoryOnly) {
      for (const table of group.tables) {
        skipped.push({ table, reason: `${group.key} flag off` });
      }
      continue;
    }

    for (const table of group.tables) {
      const exists = await tableExists(table);
      if (!exists) {
        if (inventoryOnly) {
          console.log(`${table}: absent`);
        }
        skipped.push({ table, reason: 'already absent' });
        continue;
      }

      const count = await countRows(table);
      console.log(`${table}: exists=${exists} rows=${count}`);

      if (inventoryOnly) {
        continue;
      }

      let rowsRemaining = count;
      if (
        table === 'webhook_events' &&
        rowsRemaining > 0 &&
        productionCutover &&
        confirm
      ) {
        console.log(`Purging ${rowsRemaining} legacy webhook_events rows (KV handles dedup on production)...`);
        await sql`DELETE FROM webhook_events`;
        rowsRemaining = 0;
      }

      if (rowsRemaining > 0 && !(forcePurge && group.enabled())) {
        skipped.push({ table, reason: `still has ${rowsRemaining} rows` });
        continue;
      }

      if (confirm) {
        if (rowsRemaining > 0 && forcePurge) {
          console.log(`Force-purging ${rowsRemaining} rows from ${table} (D1/KV is source of truth)...`);
        }
        await dropTable(table);
      }
      dropped.push(table);
    }
  }

  console.log('\nWould drop / dropped:', dropped);
  console.log('Skipped:', skipped);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
