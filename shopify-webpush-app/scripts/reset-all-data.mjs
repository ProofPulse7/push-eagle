/**
 * Wipe all merchant data from Neon Postgres, Cloudflare R2, and KV cache.
 * Use before reinstall testing so the dashboard starts completely fresh.
 *
 * Usage:
 *   node scripts/reset-all-data.mjs --confirm
 */

import fs from 'node:fs';
import path from 'node:path';

import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { neon } from '@neondatabase/serverless';

function loadEnvFrom(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key]) {
      continue;
    }

    const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '');
    process.env[key] = value;
  }
}

const cwd = process.cwd();
loadEnvFrom(path.resolve(cwd, '.env.local'));
loadEnvFrom(path.resolve(cwd, '.env'));
loadEnvFrom(path.resolve(cwd, '..', '.env'));

const confirmed = process.argv.includes('--confirm');
if (!confirmed) {
  console.error('Destructive reset aborted. Re-run with --confirm to wipe Neon, R2, and KV.');
  process.exit(1);
}

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Missing NEON_DATABASE_URL or DATABASE_URL.');
}

const sql = neon(databaseUrl);

const tableExists = async (qualifiedName) => {
  const rows = await sql`SELECT to_regclass(${qualifiedName}) AS exists_name`;
  return Boolean(rows[0]?.exists_name);
};

const countRows = async (tableName) => {
  if (!(await tableExists(`public.${tableName}`))) {
    return 0;
  }
  const rows = await sql.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(rows.rows?.[0]?.count ?? rows[0]?.count ?? 0);
};

const wipeNeon = async () => {
  console.log('\n--- Neon Postgres ---');

  const merchantsBefore = await countRows('merchants');
  console.log(`Merchants before: ${merchantsBefore}`);

  if (await tableExists('public.shopify_store_credentials')) {
    await sql`DELETE FROM shopify_store_credentials`;
    console.log('Cleared shopify_store_credentials.');
  }

  if (await tableExists('public.gdpr_data_exports')) {
    await sql`DELETE FROM gdpr_data_exports`;
    console.log('Cleared gdpr_data_exports.');
  }

  if (await tableExists('public.cron_heartbeats')) {
    await sql`DELETE FROM cron_heartbeats`;
    console.log('Cleared cron_heartbeats.');
  }

  if (await tableExists('public.merchants')) {
    await sql`DELETE FROM merchants`;
    console.log('Deleted all merchants (cascades campaigns, subscribers, stats, etc.).');
  }

  if (await tableExists('shopify_sessions.Session')) {
    await sql`DELETE FROM shopify_sessions."Session"`;
    console.log('Cleared shopify_sessions."Session".');
  }

  if (await tableExists('public.Session')) {
    await sql`DELETE FROM public."Session"`;
    console.log('Cleared public."Session".');
  }

  const merchantsAfter = await countRows('merchants');
  console.log(`Merchants after: ${merchantsAfter}`);
};

const getR2Client = () => {
  const bucketName = process.env.R2_BUCKET_NAME?.trim() || 'pusheagle-images';
  const accountId = process.env.R2_ACCOUNT_ID?.trim() || process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || 'd889f0c23f53a9054e3ddf29872defd7';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const endpoint = (
    process.env.R2_S3_ENDPOINT?.trim()
    || `https://${accountId}.r2.cloudflarestorage.com`
  ).replace(/\/$/, '');

  if (!bucketName || !accessKeyId || !secretAccessKey || !endpoint) {
    return null;
  }

  return {
    bucketName,
    client: new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
};

const wipeR2 = async () => {
  console.log('\n--- Cloudflare R2 ---');

  const r2 = getR2Client();
  if (!r2) {
    console.log('R2 not configured (skip). Set R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
    return;
  }

  let deleted = 0;
  let continuationToken;

  do {
    const listResponse = await r2.client.send(new ListObjectsV2Command({
      Bucket: r2.bucketName,
      ContinuationToken: continuationToken,
    }));

    const keys = (listResponse.Contents ?? [])
      .map((item) => item.Key)
      .filter(Boolean);

    if (keys.length > 0) {
      await r2.client.send(new DeleteObjectsCommand({
        Bucket: r2.bucketName,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }));
      deleted += keys.length;
    }

    continuationToken = listResponse.IsTruncated ? listResponse.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log(`Deleted ${deleted} object(s) from bucket ${r2.bucketName}.`);
};

const isKvConfigured = () =>
  Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
      && process.env.CLOUDFLARE_KV_NAMESPACE_ID?.trim()
      && process.env.CLOUDFLARE_API_TOKEN?.trim(),
  );

const wipeKv = async () => {
  console.log('\n--- Cloudflare KV ---');

  if (!isKvConfigured()) {
    console.log('KV not configured (skip).');
    return;
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID.trim();
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN.trim();
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;

  let deleted = 0;
  let cursor;

  do {
    const listUrl = new URL(`${baseUrl}/keys`);
    listUrl.searchParams.set('limit', '1000');
    if (cursor) {
      listUrl.searchParams.set('cursor', cursor);
    }

    const listResponse = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!listResponse.ok) {
      throw new Error(`KV list failed (${listResponse.status}).`);
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
        throw new Error(`KV bulk delete failed (${deleteResponse.status}).`);
      }

      deleted += keys.length;
    }

    cursor = listPayload.result_info?.cursor;
    if (!listPayload.result_info || listPayload.result_info.list_complete) {
      cursor = undefined;
    }
  } while (cursor);

  console.log(`Deleted ${deleted} KV key(s).`);
};

await wipeNeon();
await wipeR2();
await wipeKv();

console.log('\nReset complete. Reinstall or reopen the app from Shopify admin to start fresh.');
