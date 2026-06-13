import { env } from '@/lib/config/env';

const isKvConfigured = () =>
  Boolean(
    env.CLOUDFLARE_ACCOUNT_ID.trim()
      && env.CLOUDFLARE_KV_NAMESPACE_ID.trim()
      && env.CLOUDFLARE_API_TOKEN.trim(),
  );

const getKvBaseUrl = () => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID.trim();
  const namespaceId = env.CLOUDFLARE_KV_NAMESPACE_ID.trim();
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values`;
};

const getAuthHeaders = () => ({
  Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN.trim()}`,
});

export const readKvJson = async <T>(key: string): Promise<T | null> => {
  if (!isKvConfigured()) {
    return null;
  }

  const response = await fetch(`${getKvBaseUrl()}/${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: getAuthHeaders(),
    cache: 'no-store',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Cloudflare KV read failed (${response.status}).`);
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
};

export const writeKvJson = async (key: string, value: unknown, ttlSeconds?: number) => {
  if (!isKvConfigured()) {
    return false;
  }

  const url = new URL(`${getKvBaseUrl()}/${encodeURIComponent(key)}`);
  if (ttlSeconds && ttlSeconds > 0) {
    url.searchParams.set('expiration_ttl', String(Math.floor(ttlSeconds)));
  }

  const response = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });

  if (!response.ok) {
    throw new Error(`Cloudflare KV write failed (${response.status}).`);
  }

  return true;
};

export const deleteKvKey = async (key: string) => {
  if (!isKvConfigured()) {
    return false;
  }

  const response = await fetch(`${getKvBaseUrl()}/${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  return response.ok;
};

export const bootstrapKvKey = (shopDomain: string) => `bootstrap:v1:${shopDomain}`;

export const analyticsKvKey = (shopDomain: string, from: string, to: string) =>
  `analytics:v1:${shopDomain}:${from}:${to}`;

export const isCloudflareKvEnabled = isKvConfigured;
