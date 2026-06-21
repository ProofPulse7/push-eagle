'use client';

type CachedEnvelope<T> = {
  ts: number;
  data: T;
};

export const getCachedJsonStorageKey = (cacheKey: string) => `pe-cache:${cacheKey}`;

export const readCachedJsonSync = <T>(cacheKey: string): T | null => {
  if (typeof window === 'undefined' || !cacheKey.trim()) {
    return null;
  }

  try {
    const cachedRaw = localStorage.getItem(getCachedJsonStorageKey(cacheKey));
    if (!cachedRaw) {
      return null;
    }

    const parsed = JSON.parse(cachedRaw) as CachedEnvelope<T>;
    return parsed?.data ?? null;
  } catch {
    return null;
  }
};

export const writeCachedJsonSync = <T>(cacheKey: string, data: T) => {
  if (typeof window === 'undefined' || !cacheKey.trim()) {
    return;
  }

  try {
    localStorage.setItem(
      getCachedJsonStorageKey(cacheKey),
      JSON.stringify({ ts: Date.now(), data } satisfies CachedEnvelope<T>),
    );
  } catch {
    // Ignore storage quota errors.
  }
};

export const prefetchAutomationRulesCache = async (shopDomain: string) => {
  if (!shopDomain.trim()) {
    return;
  }

  try {
    const response = await fetch(
      `/api/automations/rules?shop=${encodeURIComponent(shopDomain)}`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const cacheKeys = [
      `welcome-rules:${shopDomain}`,
      `cart-rules:${shopDomain}`,
      `browse-rules:${shopDomain}`,
    ];

    for (const cacheKey of cacheKeys) {
      writeCachedJsonSync(cacheKey, payload);
    }
  } catch {
    // Background prefetch should be silent.
  }
};
