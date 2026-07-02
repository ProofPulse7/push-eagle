#!/usr/bin/env node
/**
 * Initialize Cloudflare D1 tables for storefront event tracking.
 *
 * Usage:
 *   node scripts/init-d1-events.mjs
 *
 * Requires in .env.local or environment:
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_D1_DATABASE_ID
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!accountId || !databaseId || !token) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN.');
  process.exit(1);
}

const statements = [
  `CREATE TABLE IF NOT EXISTS pixel_events (
    id TEXT PRIMARY KEY,
    shop_domain TEXT NOT NULL,
    external_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    page_url TEXT,
    product_id TEXT,
    cart_token TEXT,
    client_id TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_d1_pixel_shop_cart ON pixel_events(shop_domain, cart_token, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_d1_pixel_shop_client ON pixel_events(shop_domain, client_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_d1_pixel_shop_created ON pixel_events(shop_domain, created_at)`,
  `CREATE TABLE IF NOT EXISTS subscriber_activity_events (
    id TEXT PRIMARY KEY,
    shop_domain TEXT NOT NULL,
    external_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    page_url TEXT,
    product_id TEXT,
    cart_token TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_d1_activity_shop_cart ON subscriber_activity_events(shop_domain, cart_token, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_d1_activity_shop_created ON subscriber_activity_events(shop_domain, created_at)`,
];

const runQuery = async (sql) => {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql }),
    },
  );

  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.errors?.[0]?.message ?? `D1 query failed (${response.status})`);
  }
};

for (const sql of statements) {
  await runQuery(sql);
  console.log('OK:', sql.split('\n')[0]);
}

console.log('D1 event schema ready.');
