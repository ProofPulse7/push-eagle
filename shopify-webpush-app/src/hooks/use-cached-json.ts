'use client';

import { useEffect, useMemo, useState } from 'react';

import { readCachedJsonSync } from '@/lib/client/automation-flow-cache';

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
  const { cacheKey, url, enabled = true, refreshMs = 0 } = input;
  const storageKey = useMemo(() => getStorageKey(cacheKey), [cacheKey]);

  const [data, setData] = useState<T | null>(() => {
    if (!enabled) {
      return null;
    }
    return readCachedJsonSync<T>(cacheKey);
  });
  const [loading, setLoading] = useState(() => {
    if (!enabled) {
      return false;
    }
    return !readCachedJsonSync<T>(cacheKey);
  });

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
