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

const statusRows = await sql`
  SELECT status, COUNT(*)::INT AS count
  FROM automation_jobs
  GROUP BY status
  ORDER BY count DESC
`;
console.log('automation_jobs by status:', statusRows);

const sizeRows = await sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size`;
console.log('db size:', sizeRows);

const oldDone = await sql`
  SELECT COUNT(*)::INT AS count
  FROM automation_jobs
  WHERE status IN ('completed', 'failed', 'cancelled')
    AND COALESCE(processed_at, updated_at, created_at) < NOW() - INTERVAL '7 days'
`;
console.log('old terminal jobs >7d:', oldDone);
