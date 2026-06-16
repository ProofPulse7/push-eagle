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
loadEnvFrom(path.resolve(cwd, '.env.vercel.prod'));
loadEnvFrom(path.resolve(cwd, '..', '.env'));

const shopDomain = String(process.argv[2] ?? process.env.SHOP_DOMAIN ?? '')
  .trim()
  .toLowerCase();

if (!shopDomain.endsWith('.myshopify.com')) {
  throw new Error('Usage: node scripts/purge-shop-data.mjs <shop.myshopify.com>');
}

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Missing NEON_DATABASE_URL or DATABASE_URL.');
}

const sessionDatabaseUrl = process.env.SHOPIFY_SESSION_DATABASE_URL || databaseUrl;
const sql = neon(databaseUrl);
const sessionSql = sessionDatabaseUrl === databaseUrl ? sql : neon(sessionDatabaseUrl);

const purgePrismaSessions = async () => {
  const offlineId = `offline_${shopDomain}`;
  const attempts = [
    () => sessionSql`DELETE FROM public."Session" WHERE id = ${offlineId}`,
    () => sessionSql`DELETE FROM public."Session" WHERE shop = ${shopDomain}`,
    () => sessionSql`DELETE FROM shopify_sessions."Session" WHERE id = ${offlineId}`,
    () => sessionSql`DELETE FROM shopify_sessions."Session" WHERE shop = ${shopDomain}`,
  ];

  for (const attempt of attempts) {
    try {
      await attempt();
    } catch {
      // table/schema may not exist in this database
    }
  }
};

const main = async () => {
  const beforeRows = await sql`
    SELECT shop_domain
    FROM merchants
    WHERE shop_domain = ${shopDomain}
    LIMIT 1
  `;

  if (!beforeRows[0]) {
    console.log(`No merchant row found for ${shopDomain}. Checking for orphan data only.`);
  }

  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::INT FROM subscribers WHERE shop_domain = ${shopDomain}) AS subscribers,
      (SELECT COUNT(*)::INT FROM subscriber_tokens WHERE shop_domain = ${shopDomain}) AS tokens,
      (SELECT COUNT(*)::INT FROM campaigns WHERE shop_domain = ${shopDomain}) AS campaigns,
      (SELECT COUNT(*)::INT FROM automation_jobs WHERE shop_domain = ${shopDomain}) AS automation_jobs
  `;

  const snapshot = counts[0] ?? {};
  console.log('Before purge:', {
    shopDomain,
    subscribers: Number(snapshot.subscribers ?? 0),
    tokens: Number(snapshot.tokens ?? 0),
    campaigns: Number(snapshot.campaigns ?? 0),
    automationJobs: Number(snapshot.automation_jobs ?? 0),
  });

  await purgePrismaSessions();

  try {
    await sql`DELETE FROM gdpr_data_exports WHERE shop_domain = ${shopDomain}`;
  } catch {
    // optional table
  }

  const deleted = await sql`
    DELETE FROM merchants
    WHERE shop_domain = ${shopDomain}
    RETURNING shop_domain
  `;

  const afterRows = await sql`
    SELECT
      (SELECT COUNT(*)::INT FROM subscribers WHERE shop_domain = ${shopDomain}) AS subscribers,
      (SELECT COUNT(*)::INT FROM campaigns WHERE shop_domain = ${shopDomain}) AS campaigns
  `;

  const after = afterRows[0] ?? {};
  console.log('Purge complete:', {
    shopDomain,
    merchantDeleted: deleted.length > 0,
    remainingSubscribers: Number(after.subscribers ?? 0),
    remainingCampaigns: Number(after.campaigns ?? 0),
  });
};

await main();
