import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '..', 'src', 'lib', 'client', 'coming-soon-automations.ts');
const action = process.argv[2];

if (action !== 'lock' && action !== 'unlock') {
  console.error('Usage: node scripts/toggle-coming-soon-automations.mjs <lock|unlock>');
  process.exit(1);
}

const enabled = action === 'lock';
const source = fs.readFileSync(configPath, 'utf8');
const pattern = /export const COMING_SOON_AUTOMATIONS_ENABLED = (true|false);/;

if (!pattern.test(source)) {
  console.error('Could not find COMING_SOON_AUTOMATIONS_ENABLED in coming-soon-automations.ts');
  process.exit(1);
}

const next = source.replace(pattern, `export const COMING_SOON_AUTOMATIONS_ENABLED = ${enabled};`);
fs.writeFileSync(configPath, next);

console.log(
  enabled
    ? 'Coming soon lock enabled for browse abandonment, shipping, back in stock, and price drop.'
    : 'Coming soon lock removed. All automations are fully accessible again.',
);
