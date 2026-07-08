/**
 * Count D1 audience rows via Cloudflare HTTP API.
 * Usage: node scripts/count-d1-audience.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

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

const cwd = process.cwd();
loadEnvFrom(path.resolve(cwd, '.env.local'));
loadEnvFrom(path.resolve(cwd, '.env'));
loadEnvFrom(path.resolve(cwd, 'cloudflare-cron', '.dev.vars'));

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const audienceDb = process.env.CLOUDFLARE_D1_AUDIENCE_DATABASE_ID;

console.log('account?', Boolean(accountId), 'token?', Boolean(token), 'audienceDb?', Boolean(audienceDb));
if (!accountId || !token || !audienceDb) {
  process.exit(1);
}

async function query(sqlText) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${audienceDb}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql: sqlText }),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(JSON.stringify(json.errors || json));
  }
  return json.result;
}

const subs = await query('SELECT COUNT(*) AS count FROM subscribers');
const tokens = await query('SELECT COUNT(*) AS count FROM subscriber_tokens');
console.log('D1 subscribers:', JSON.stringify(subs));
console.log('D1 subscriber_tokens:', JSON.stringify(tokens));
