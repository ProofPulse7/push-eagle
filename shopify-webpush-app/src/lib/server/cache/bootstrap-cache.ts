type BootstrapCacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const cache = new Map<string, BootstrapCacheEntry>();

const DEFAULT_TTL_MS = 30 * 60_000;

export const readBootstrapCache = (shopDomain: string) => {
  const entry = cache.get(shopDomain);
  if (!entry) {
    return null;
  }

  if (Date.now() >= entry.expiresAt) {
    cache.delete(shopDomain);
    return null;
  }

  return entry.payload;
};

export const writeBootstrapCache = (shopDomain: string, payload: unknown, ttlMs = DEFAULT_TTL_MS) => {
  cache.set(shopDomain, {
    expiresAt: Date.now() + ttlMs,
    payload,
  });
};

export const invalidateBootstrapCache = (shopDomain: string) => {
  cache.delete(shopDomain);
};
