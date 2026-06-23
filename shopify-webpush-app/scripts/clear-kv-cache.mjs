/**
 * Clear all keys from Cloudflare KV namespace DASHBOARD_CACHE.
 *
 * Usage:
 *   npm run kv:clear
 *
 * Uses CLOUDFLARE_API_TOKEN from .env.local when set, otherwise wrangler CLI (OAuth).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFrom(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '');
  }
}

const cwd = process.cwd();
loadEnvFrom(path.resolve(cwd, '.env.local'));
loadEnvFrom(path.resolve(cwd, '.env'));
loadEnvFrom(path.resolve(cwd, '..', '.env'));

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || 'd889f0c23f53a9054e3ddf29872defd7';
const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID?.trim() || '29ce646c32eb44d884376f1201749452';
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

const wipeKvViaApi = async () => {
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;
  let deleted = 0;
  let cursor;

  do {
    const listUrl = new URL(`${baseUrl}/keys`);
    listUrl.searchParams.set('limit', '1000');
    if (cursor) listUrl.searchParams.set('cursor', cursor);

    const listResponse = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!listResponse.ok) {
      const body = await listResponse.text();
      throw new Error(`KV list failed (${listResponse.status}): ${body}`);
    }

    const listPayload = await listResponse.json();
    const keys = (listPayload.result ?? []).map((entry) => entry.name).filter(Boolean);

    if (keys.length > 0) {
      const deleteResponse = await fetch(`${baseUrl}/bulk`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(keys),
      });

      if (!deleteResponse.ok) {
        const body = await deleteResponse.text();
        throw new Error(`KV bulk delete failed (${deleteResponse.status}): ${body}`);
      }

      deleted += keys.length;
      console.log(`Deleted ${keys.length} key(s)... (${deleted} total)`);
    }

    cursor = listPayload.result_info?.list_complete ? undefined : listPayload.result_info?.cursor;
  } while (cursor);

  return deleted;
};

const wipeKvViaWrangler = () => {
  const wranglerCwd = path.resolve(cwd, 'cloudflare-cron');
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const runWrangler = (args) => execFileSync(npx, ['wrangler', ...args], {
    cwd: wranglerCwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  const listOutput = runWrangler(['kv', 'key', 'list', '--namespace-id', namespaceId]);
  const keys = JSON.parse(listOutput.trim() || '[]').map((entry) => entry.name).filter(Boolean);

  for (const key of keys) {
    runWrangler(['kv', 'key', 'delete', key, '--namespace-id', namespaceId]);
    console.log(`Deleted ${key}`);
  }

  return keys.length;
};

console.log(`Clearing KV namespace DASHBOARD_CACHE (${namespaceId})...`);

const deleted = token
  ? await wipeKvViaApi()
  : wipeKvViaWrangler();

console.log(`Done. Deleted ${deleted} KV key(s) from DASHBOARD_CACHE.`);
