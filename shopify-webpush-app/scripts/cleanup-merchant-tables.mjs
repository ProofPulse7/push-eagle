import fs from 'node:fs';
import path from 'node:path';

import { neon } from '@neondatabase/serverless';

function loadEnvFrom(filePath) {
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
    if (!key || process.env[key]) {
      continue;
    }

    const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '');
    process.env[key] = value;
  }
}

const cwd = process.cwd();
loadEnvFrom(path.resolve(cwd, '.env.local'));
loadEnvFrom(path.resolve(cwd, '.env'));
loadEnvFrom(path.resolve(cwd, '..', '.env'));

const databaseUrl = process.env.NEON_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Missing NEON_DATABASE_URL. Set it in shopify-webpush-app/.env.local or root .env.');
}

const sql = neon(databaseUrl);

const main = async () => {
  await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS shop_id TEXT`;
  await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS store_name TEXT`;
  await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS email TEXT`;
  await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS primary_domain TEXT`;
  await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS myshopify_domain TEXT`;
  await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS currency_code TEXT`;
  await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS timezone TEXT`;
  await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS plan_name TEXT`;
  await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS owner_name TEXT`;
  await sql`ALTER TABLE merchants ADD COLUMN IF NOT EXISTS scopes TEXT`;

  const tableRows = await sql`
    SELECT to_regclass('public.merchant_profiles') AS exists_name
  `;

  const exists = Boolean(tableRows[0]?.exists_name);
  if (!exists) {
    console.log('merchant_profiles does not exist. No cleanup needed.');
    return;
  }

  await sql`
    INSERT INTO merchants (
      shop_domain,
      shop_id,
      store_name,
      email,
      primary_domain,
      myshopify_domain,
      currency_code,
      timezone,
      plan_name,
      owner_name,
      scopes,
      updated_at
    )
    SELECT
      p.shop_domain,
      p.shop_id,
      p.store_name,
      p.email,
      p.primary_domain,
      p.myshopify_domain,
      p.currency_code,
      p.timezone,
      p.plan_name,
      p.owner_name,
      p.scopes,
      NOW()
    FROM merchant_profiles p
    ON CONFLICT (shop_domain)
    DO UPDATE SET
      shop_id = COALESCE(EXCLUDED.shop_id, merchants.shop_id),
      store_name = COALESCE(EXCLUDED.store_name, merchants.store_name),
      email = COALESCE(EXCLUDED.email, merchants.email),
      primary_domain = COALESCE(EXCLUDED.primary_domain, merchants.primary_domain),
      myshopify_domain = COALESCE(EXCLUDED.myshopify_domain, merchants.myshopify_domain),
      currency_code = COALESCE(EXCLUDED.currency_code, merchants.currency_code),
      timezone = COALESCE(EXCLUDED.timezone, merchants.timezone),
      plan_name = COALESCE(EXCLUDED.plan_name, merchants.plan_name),
      owner_name = COALESCE(EXCLUDED.owner_name, merchants.owner_name),
      scopes = COALESCE(EXCLUDED.scopes, merchants.scopes),
      updated_at = NOW()
  `;

  await sql`DROP TABLE merchant_profiles`;
  console.log('Merged merchant_profiles into merchants and dropped merchant_profiles.');
};

await main();
