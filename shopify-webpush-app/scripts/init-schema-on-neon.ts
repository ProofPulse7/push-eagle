import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

import { getMerchantOverview } from '../src/lib/server/data/store';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '../.env' });

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Set NEON_DATABASE_URL or DATABASE_URL');
  process.exit(1);
}

const sql = neon(connectionString);

async function main() {
  await getMerchantOverview('schema-init-test.myshopify.com');

  const tables = await sql<{ tablename: string }[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;

  const required = [
    'Session',
    'merchants',
    'subscribers',
    'subscriber_tokens',
    'campaigns',
    'campaign_deliveries',
    'automation_jobs',
    'automation_rules',
    'ingestion_jobs',
    'webhook_events',
    'segments',
    'pixel_events',
  ];

  const names = new Set(tables.map((row) => row.tablename));
  const missing = required.filter((name) => !names.has(name));

  console.log('ensureSchema completed.');
  console.log(`Public tables: ${tables.length}`);

  if (missing.length > 0) {
    console.error('Missing required tables:', missing.join(', '));
    process.exit(1);
  }

  console.log('All required tables present.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
