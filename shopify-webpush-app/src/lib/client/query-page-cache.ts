'use client';

const PREFIX = 'pe:page-cache:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = {
  ts: number;
  data: T;
};

export const readPageCache = <T>(key: string): T | undefined => {
  if (typeof window === 'undefined' || !key) {
    return undefined;
  }

  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.data || typeof parsed.ts !== 'number') {
      return undefined;
    }

    if (Date.now() - parsed.ts > MAX_AGE_MS) {
      localStorage.removeItem(`${PREFIX}${key}`);
      return undefined;
    }

    return parsed.data;
  } catch {
    return undefined;
  }
};

export const writePageCache = <T>(key: string, data: T) => {
  if (typeof window === 'undefined' || !key) {
    return;
  }

  try {
    const envelope: CacheEnvelope<T> = { ts: Date.now(), data };
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(envelope));
  } catch {
    // Ignore quota errors.
  }
};
