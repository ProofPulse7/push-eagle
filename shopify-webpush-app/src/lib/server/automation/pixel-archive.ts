import { gzipSync } from 'zlib';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { env } from '@/lib/config/env';

export type PixelArchiveEvent = {
  id: string;
  shop_domain: string;
  external_id: string;
  event_type: string;
  page_url: string | null;
  product_id: string | null;
  cart_token: string | null;
  client_id: string | null;
  metadata: unknown;
  created_at: string;
};

const getRequired = (value: string, name: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} is not configured.`);
  }
  return trimmed;
};

export const isPixelArchiveEnabled = () =>
  Boolean(
    env.R2_BUCKET_NAME.trim()
      && env.R2_ACCESS_KEY_ID.trim()
      && env.R2_SECRET_ACCESS_KEY.trim()
      && (env.R2_S3_ENDPOINT.trim() || env.R2_ACCOUNT_ID.trim()),
  );

const getR2ClientConfig = () => {
  const bucketName = getRequired(env.R2_BUCKET_NAME, 'R2_BUCKET_NAME');
  const endpoint = (env.R2_S3_ENDPOINT.trim() || (env.R2_ACCOUNT_ID.trim()
    ? `https://${env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`
    : '')).replace(/\/$/, '');
  if (!endpoint) {
    throw new Error('R2_S3_ENDPOINT or R2_ACCOUNT_ID is not configured.');
  }

  return {
    bucketName,
    endpoint,
    accessKeyId: getRequired(env.R2_ACCESS_KEY_ID, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: getRequired(env.R2_SECRET_ACCESS_KEY, 'R2_SECRET_ACCESS_KEY'),
  };
};

let archiveClient: S3Client | null = null;

const getArchiveClient = () => {
  if (archiveClient) {
    return archiveClient;
  }

  const config = getR2ClientConfig();
  archiveClient = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return archiveClient;
};

const buildArchiveObjectKey = (shopDomain: string, dayKey: string, batchId: string) =>
  ['pixel-archive', shopDomain, `${dayKey}-${batchId}.jsonl.gz`].join('/');

export const archivePixelEventsToR2 = async (
  events: PixelArchiveEvent[],
): Promise<{ uploaded: number; objectKeys: string[] }> => {
  if (!isPixelArchiveEnabled() || events.length === 0) {
    return { uploaded: 0, objectKeys: [] };
  }

  const config = getR2ClientConfig();
  const grouped = new Map<string, PixelArchiveEvent[]>();

  for (const event of events) {
    const dayKey = event.created_at.slice(0, 10);
    const groupKey = `${event.shop_domain}:${dayKey}`;
    const bucket = grouped.get(groupKey) ?? [];
    bucket.push(event);
    grouped.set(groupKey, bucket);
  }

  const objectKeys: string[] = [];
  const batchId = `${Date.now()}`;

  for (const [groupKey, groupEvents] of grouped.entries()) {
    const [shopDomain, dayKey] = groupKey.split(':');
    const jsonl = groupEvents.map((event) => JSON.stringify(event)).join('\n');
    const body = gzipSync(Buffer.from(jsonl, 'utf8'));
    const objectKey = buildArchiveObjectKey(shopDomain, dayKey, batchId);

    await getArchiveClient().send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: objectKey,
      Body: body,
      ContentType: 'application/jsonl',
      ContentEncoding: 'gzip',
      CacheControl: 'private, max-age=31536000, immutable',
      Metadata: {
        shopDomain,
        dayKey,
        eventCount: String(groupEvents.length),
      },
    }));

    objectKeys.push(objectKey);
  }

  return { uploaded: events.length, objectKeys: objectKeys };
};
