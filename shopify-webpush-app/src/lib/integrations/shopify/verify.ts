import crypto from 'crypto';

import { env } from '@/lib/config/env';

const createDigest = (value: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(value, 'utf8').digest();

export const verifyShopifyWebhookSignature = (rawBody: string, signature: string | null) => {
  const secret = env.SHOPIFY_WEBHOOK_SECRET || env.SHOPIFY_API_SECRET;
  if (!signature || !secret) {
    return false;
  }

  const expected = createDigest(rawBody, secret).toString('base64');
  const providedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

const normalizeProxyParams = (searchParams: URLSearchParams) => {
  const parts: string[] = [];

  const keys = Array.from(new Set(Array.from(searchParams.keys())))
    .filter((key) => key !== 'signature')
    .sort();

  for (const key of keys) {
    const values = searchParams.getAll(key);
    parts.push(`${key}=${values.join(',')}`);
  }

  return parts.join('');
};

export const verifyShopifyAppProxySignature = (searchParams: URLSearchParams) => {
  const signature = searchParams.get('signature');
  if (!signature || !env.SHOPIFY_API_SECRET) {
    return false;
  }

  const normalized = normalizeProxyParams(searchParams);
  const expected = createDigest(normalized, env.SHOPIFY_API_SECRET).toString('hex');
  const providedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};
