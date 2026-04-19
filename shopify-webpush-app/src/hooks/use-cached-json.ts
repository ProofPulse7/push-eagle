'use client';

import { useEffect, useMemo, useState } from 'react';

type CachedEnvelope<T> = {
  ts: number;
  data: T;
};

const getStorageKey = (cacheKey: string) => `pe-cache:${cacheKey}`;

export const useCachedJson = <T>(input: {
  cacheKey: string;
  url: string;
  enabled?: boolean;
  refreshMs?: number;
}) => {
  const { cacheKey, url, enabled = true, refreshMs = 30_000 } = input;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(enabled));

  const storageKey = useMemo(() => getStorageKey(cacheKey), [cacheKey]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    // Serve cached data instantly, then revalidate in background.
    try {
      const cachedRaw = localStorage.getItem(storageKey);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw) as CachedEnvelope<T>;
        if (parsed?.data != null) {
          setData(parsed.data);
          setLoading(false);
        }
      }
    } catch {
      // Ignore malformed cache entries.
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
