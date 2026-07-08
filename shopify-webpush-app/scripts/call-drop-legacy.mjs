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

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('Missing CRON_SECRET');
  process.exit(1);
}

const action = process.argv[2] || 'inventory';
const base = 'https://push-eagle-dashboard.vercel.app/api/admin/neon/drop-legacy-tables';

if (action === 'inventory') {
  const res = await fetch(base, { headers: { 'X-Cron-Secret': secret } });
  console.log('status', res.status);
  console.log(await res.text());
} else if (action === 'dry-run' || action === 'drop' || action === 'force-drop') {
  const res = await fetch(base, {
    method: 'POST',
    headers: {
      'X-Cron-Secret': secret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action }),
  });
  console.log('status', res.status);
  console.log(await res.text());
} else {
  console.error('Usage: node scripts/call-drop-legacy.mjs [inventory|dry-run|drop|force-drop]');
  process.exit(1);
}
