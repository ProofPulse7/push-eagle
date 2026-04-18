import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

const cwd = process.cwd();
for (const fileName of ['.env.local', '.env']) {
  const filePath = path.join(cwd, fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Missing NEON_DATABASE_URL or DATABASE_URL');
  process.exit(1);
}

const sql = neon(databaseUrl);

const rows = await sql`
  SELECT tablename, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN (
      'subscribers',
      'subscriber_tokens',
      'shopify_fulfillments',
      'shopify_product_variants',
      'shopify_orders',
      'automation_jobs',
      'automation_rules'
    )
  ORDER BY tablename, indexname
`;

console.log(JSON.stringify(rows, null, 2));