import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

const cwd = process.cwd();
for (const fileName of ['.env.local', '.env']) {
  const filePath = path.join(cwd, fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}

const args = process.argv.slice(2);
const getArgValue = (flag, fallback = '') => {
  const index = args.indexOf(flag);
  if (index === -1) {
    return fallback;
  }

  return args[index + 1] ?? fallback;
};

const shopDomain = getArgValue('--shop', 'test-shop.myshopify.com');
const baseUrl = getArgValue('--base', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010');
const maxJobs = Number(getArgValue('--max-jobs', '200'));
const maxConcurrent = Number(getArgValue('--max-concurrent', '50'));
const secret = process.env.CRON_SECRET || '';

const response = await fetch(new URL('/api/automations/step-all', baseUrl), {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
  },
  body: JSON.stringify({
    shopDomain,
    maxJobs,
    maxConcurrent,
  }),
});

const payload = await response.json();

if (!response.ok || !payload.ok) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(payload, null, 2));