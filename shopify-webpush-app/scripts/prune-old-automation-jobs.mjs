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
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFrom(path.resolve(process.cwd(), '.env.local'));
loadEnvFrom(path.resolve(process.cwd(), '.env'));
const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);

const deleted = await sql`
  DELETE FROM automation_jobs
  WHERE status IN ('sent', 'failed', 'skipped')
    AND updated_at < NOW() - INTERVAL '14 days'
  RETURNING id
`;
console.log('deleted terminal automation_jobs older than 14d:', deleted.length);

const remaining = await sql`
  SELECT status, COUNT(*)::INT AS count
  FROM automation_jobs
  GROUP BY status
  ORDER BY count DESC
`;
console.log('remaining automation_jobs:', remaining);

const size = await sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size`;
console.log('db size:', size);
