'use client';

import { useEffect, useMemo, useState } from 'react';

type CachedEnvelope<T> = {
  ts: number;
  data: T;
};

const getStorageKey = (cacheKey: string) => `pe-cache:${cacheKey}`;

const readSyncCache = <T>(storageKey: string): T | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cachedRaw = localStorage.getItem(storageKey);
    if (!cachedRaw) {
      return null;
    }

    const parsed = JSON.parse(cachedRaw) as CachedEnvelope<T>;
    return parsed?.data ?? null;
  } catch {
    return null;
  }
};

export const useCachedJson = <T>(input: {
  cacheKey: string;
  url: string;
  enabled?: boolean;
  refreshMs?: number;
}) => {
  const { cacheKey, url, enabled = true, refreshMs = 0 } = input;
  const storageKey = useMemo(() => getStorageKey(cacheKey), [cacheKey]);

  const [data, setData] = useState<T | null>(() =>
    enabled && cacheKey ? readSyncCache<T>(getStorageKey(cacheKey)) : null,
  );
  const [loading, setLoading] = useState(() => {
    if (!enabled) {
      return false;
    }

    return readSyncCache<T>(getStorageKey(cacheKey)) == null;
  });

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const cached = readSyncCache<T>(storageKey);
    if (cached != null) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const fetchFresh = async () => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
          return;
        }
        const json = (await response.json()) as T;
        if (cancelled) {
          return;
        }
        setData(json);
        localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), data: json } satisfies CachedEnvelope<T>));
      } catch {
        // Background refresh should be silent for UX.
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchFresh();
    if (refreshMs <= 0) {
      return () => {
        cancelled = true;
      };
    }

    const intervalId = window.setInterval(() => {
      void fetchFresh();
    }, refreshMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, refreshMs, storageKey, url]);

  return { data, loading };
};
