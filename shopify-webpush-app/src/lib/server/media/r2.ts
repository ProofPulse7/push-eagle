import { randomUUID } from 'crypto';

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { env } from '@/lib/config/env';

const getRequired = (value: string, name: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} is not configured.`);
  }
  return trimmed;
};

const getR2Config = () => {
  const bucketName = getRequired(env.R2_BUCKET_NAME, 'R2_BUCKET_NAME');
  const endpoint = (env.R2_S3_ENDPOINT.trim() || (env.R2_ACCOUNT_ID.trim()
    ? `https://${env.R2_ACCOUNT_ID.trim()}.r2.cloudflarestorage.com`
    : '')).replace(/\/$/, '');
  if (!endpoint) {
    throw new Error('R2_S3_ENDPOINT or R2_ACCOUNT_ID is not configured.');
  }
  const accessKeyId = getRequired(env.R2_ACCESS_KEY_ID, 'R2_ACCESS_KEY_ID');
  const secretAccessKey = getRequired(env.R2_SECRET_ACCESS_KEY, 'R2_SECRET_ACCESS_KEY');
  return {
    bucketName,
    endpoint,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: env.R2_PUBLIC_BASE_URL.trim().replace(/\/$/, ''),
  };
};

let client: S3Client | null = null;

const getClient = () => {
  if (client) {
    return client;
  }

  const config = getR2Config();
  client = new S3Client({
    region: 'auto',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return client;
};

const extensionByContentType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
};

const getExtension = (contentType: string) => {
  return extensionByContentType[contentType] ?? 'bin';
};

export const uploadImageToR2 = async (input: {
  shopDomain: string;
  contentType: string;
  bytes: Buffer;
}) => {
  const config = getR2Config();
  const objectKey = [
    'merchant-media',
    input.shopDomain,
    `${Date.now()}-${randomUUID()}.${getExtension(input.contentType)}`,
  ].join('/');

  await getClient().send(new PutObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
    Body: input.bytes,
    ContentType: input.contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  return {
    objectKey,
    publicUrl: config.publicBaseUrl ? `${config.publicBaseUrl}/${objectKey}` : null,
  };
};

export const getImageFromR2 = async (objectKey: string) => {
  const config = getR2Config();
  const response = await getClient().send(new GetObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
  }));

  const body = response.Body;
  if (!body) {
    throw new Error('R2 object body is missing.');
  }

  const bytes = Buffer.from(await body.transformToByteArray());

  return {
    bytes,
    contentType: String(response.ContentType ?? 'application/octet-stream'),
    cacheControl: String(response.CacheControl ?? 'public, max-age=31536000, immutable'),
  };
};

export const deleteImageFromR2 = async (objectKey: string) => {
  const config = getR2Config();
  await getClient().send(new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
  }));
};
