/**
 * Inventory Neon public tables + legacy D1-migrated table eligibility.
 * Usage: node scripts/inspect-neon-legacy.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

function loadEnvFrom(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key] || !String(process.env[key]).trim()) {
      process.env[key] = value;
    }
  }
}

const cwd = process.cwd();
loadEnvFrom(path.resolve(cwd, '.env.local'));
loadEnvFrom(path.resolve(cwd, '.env'));
loadEnvFrom(path.resolve(cwd, '.env.production.local'));

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Missing NEON_DATABASE_URL');
  process.exit(1);
}

const flag = (k) => String(process.env[k] ?? '').trim();
console.log('Flags from local env:');
for (const k of [
  'D1_AUDIENCE_MODE',
  'D1_EVENTS_ENABLED',
  'D1_DELIVERIES_ENABLED',
  'D1_COMMERCE_ENABLED',
  'D1_CUSTOMERS_ENABLED',
  'D1_CATALOG_ENABLED',
  'CLOUDFLARE_KV_NAMESPACE_ID',
]) {
  const v = flag(k);
  console.log(`  ${k}=${v ? (k.includes('NAMESPACE') || k.includes('URL') ? '[set]' : v) : '[empty]'}`);
}

const sql = neon(databaseUrl);

const tables = await sql`
  SELECT
    c.relname AS table_name,
    COALESCE(s.n_live_tup, 0)::BIGINT AS estimated_rows,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY pg_total_relation_size(c.oid) DESC, c.relname
`;

console.log('\nNeon public tables (est. rows / size):');
for (const row of tables) {
  console.log(`  ${row.table_name}: ~${row.estimated_rows} rows, ${row.total_size}`);
}

const legacy = [
  'subscribers',
  'subscriber_tokens',
  'campaign_deliveries',
  'campaign_clicks',
  'automation_deliveries',
  'automation_clicks',
  'shopify_order_items',
  'shopify_orders',
  'shopify_fulfillments',
  'shopify_customers',
  'shopify_product_variants',
  'pixel_events',
  'subscriber_activity_events',
  'webhook_events',
];

  // Count via exact query fails if table has weird name; use switch like drop script.
  const countMap = {
    subscribers: async () => Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM subscribers`)[0]?.count ?? 0),
    subscriber_tokens: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM subscriber_tokens`)[0]?.count ?? 0),
    campaign_deliveries: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM campaign_deliveries`)[0]?.count ?? 0),
    campaign_clicks: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM campaign_clicks`)[0]?.count ?? 0),
    automation_deliveries: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM automation_deliveries`)[0]?.count ?? 0),
    automation_clicks: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM automation_clicks`)[0]?.count ?? 0),
    shopify_order_items: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_order_items`)[0]?.count ?? 0),
    shopify_orders: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_orders`)[0]?.count ?? 0),
    shopify_fulfillments: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_fulfillments`)[0]?.count ?? 0),
    shopify_customers: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_customers`)[0]?.count ?? 0),
    shopify_product_variants: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM shopify_product_variants`)[0]?.count ?? 0),
    pixel_events: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM pixel_events`)[0]?.count ?? 0),
    subscriber_activity_events: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM subscriber_activity_events`)[0]?.count ?? 0),
    webhook_events: async () =>
      Number((await sql`SELECT COUNT(*)::BIGINT AS count FROM webhook_events`)[0]?.count ?? 0),
  };

  console.log('\nExact counts for legacy candidates:');
  for (const table of legacy) {
    const existsRows = await sql`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS exists`;
    if (!existsRows[0]?.exists) {
      console.log(`  ${table}: ABSENT`);
      continue;
    }
    const count = await countMap[table]();
    console.log(`  ${table}: ${count} rows`);
  }
