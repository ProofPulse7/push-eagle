import { neon } from '@neondatabase/serverless';

const url = process.env.NEON_DATABASE_URL;
if (!url) {
  console.error('NEON_DATABASE_URL missing');
  process.exit(1);
}

const sql = neon(url);
const [subRows, tokRows] = await Promise.all([
  sql`SELECT COUNT(*)::int AS c FROM subscribers`,
  sql`SELECT COUNT(*)::int AS c FROM subscriber_tokens WHERE status = 'active'`,
]);

console.log(
  JSON.stringify({
    neonSubscribers: Number(subRows[0]?.c ?? 0),
    neonActiveTokens: Number(tokRows[0]?.c ?? 0),
  }),
);
