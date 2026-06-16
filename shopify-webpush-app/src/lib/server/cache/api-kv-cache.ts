import { bootstrapKvKey, deleteKvKey, isCloudflareKvEnabled, readKvJson, writeKvJson } from '@/lib/server/cache/cloudflare-kv';
import { invalidateBootstrapCache } from '@/lib/server/cache/bootstrap-cache';

export const shopApiKvKey = (shopDomain: string, scope: string) =>
  `api:v1:${shopDomain.trim().toLowerCase()}:${scope}`;

export const API_KV_TTL = {
  bootstrap: 600,
  analytics: 600,
  segments: 300,
  campaigns: 30,
  subscribersOverview: 300,
  automationsOverview: 300,
} as const;

export const withShopApiKvCache = async <T>(
  shopDomain: string,
  scope: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> => {
  const key = shopApiKvKey(shopDomain, scope);

  if (isCloudflareKvEnabled()) {
    try {
      const cached = await readKvJson<T>(key);
      if (cached != null) {
        return cached;
      }
    } catch (error) {
      console.error('[api-kv-cache] read failed', scope, error);
    }
  }

  const fresh = await loader();

  if (isCloudflareKvEnabled()) {
    void writeKvJson(key, fresh, ttlSeconds).catch((error) => {
      console.error('[api-kv-cache] write failed', scope, error);
    });
  }

  return fresh;
};

export const invalidateShopApiKvCache = async (shopDomain: string, scope: string) => {
  if (!isCloudflareKvEnabled()) {
    return;
  }

  try {
    await deleteKvKey(shopApiKvKey(shopDomain, scope));
  } catch (error) {
    console.error('[api-kv-cache] invalidate failed', scope, error);
  }
};

export const invalidateShopDashboardCaches = async (shopDomain: string) => {
  invalidateBootstrapCache(shopDomain);

  if (!isCloudflareKvEnabled()) {
    return;
  }

  await Promise.all([
    deleteKvKey(bootstrapKvKey(shopDomain)),
    invalidateShopApiKvCache(shopDomain, 'segments'),
    invalidateShopApiKvCache(shopDomain, 'campaigns'),
    invalidateShopApiKvCache(shopDomain, 'campaign-audience'),
    invalidateShopApiKvCache(shopDomain, 'subscribers-overview'),
    invalidateShopApiKvCache(shopDomain, 'automations-overview'),
  ]);
};
