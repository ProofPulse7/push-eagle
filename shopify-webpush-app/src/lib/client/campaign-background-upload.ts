'use client';

import { compressDataUrl } from '@/lib/client/image-compress';
import type { ImageCompressProfile } from '@/lib/client/image-compress';

const cacheKey = (shop: string) => `pe:media-upload-cache:${shop.trim().toLowerCase()}`;

type UploadCache = Record<string, string>;

const inFlight = new Map<string, Promise<string | null>>();

const readCache = (shop: string): UploadCache => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return {};
  }

  try {
    const raw = sessionStorage.getItem(cacheKey(shop));
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as UploadCache;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeCacheEntry = (shop: string, sourceKey: string, url: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    const cache = readCache(shop);
    cache[sourceKey] = url;
    sessionStorage.setItem(cacheKey(shop), JSON.stringify(cache));
  } catch {
    // Ignore quota errors.
  }
};

const uploadDataUrl = async (shopDomain: string, dataUrl: string): Promise<string> => {
  const response = await fetch('/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopDomain, dataUrl }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.asset?.url) {
    const message =
      payload && typeof payload === 'object' && typeof payload.error === 'string'
        ? payload.error
        : 'Failed to upload campaign image.';
    throw new Error(message);
  }

  return String(payload.asset.url);
};

const buildSourceKey = (source: string) => {
  const trimmed = source.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return trimmed.slice(0, 120);
};

export const getCachedUploadedUrl = (shopDomain: string, source: string | null | undefined) => {
  const trimmed = source?.trim();
  if (!trimmed || !shopDomain.trim()) {
    return null;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return readCache(shopDomain)[buildSourceKey(trimmed)] ?? null;
};

export const scheduleBackgroundMediaUpload = (
  shopDomain: string,
  source: string,
  profile: ImageCompressProfile = 'hero',
): Promise<string | null> => {
  const trimmed = source.trim();
  if (!shopDomain.trim() || !trimmed) {
    return Promise.resolve(null);
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return Promise.resolve(trimmed);
  }

  const sourceKey = buildSourceKey(trimmed);
  const cached = readCache(shopDomain)[sourceKey];
  if (cached) {
    return Promise.resolve(cached);
  }

  const flightKey = `${shopDomain}:${sourceKey}`;
  const existing = inFlight.get(flightKey);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    try {
      let dataUrl = trimmed;
      if (dataUrl.startsWith('blob:')) {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(new Error('Failed to read image.'));
          reader.readAsDataURL(blob);
        });
      }

      if (dataUrl.startsWith('data:image/')) {
        dataUrl = await compressDataUrl(dataUrl, profile);
      }

      const uploaded = await uploadDataUrl(shopDomain, dataUrl);
      writeCacheEntry(shopDomain, sourceKey, uploaded);
      return uploaded;
    } catch {
      return null;
    } finally {
      inFlight.delete(flightKey);
    }
  })();

  inFlight.set(flightKey, task);
  return task;
};

export const resolveMediaSourceForLaunch = async (
  shopDomain: string,
  source: string | null | undefined,
  profile: ImageCompressProfile = 'hero',
): Promise<string | null> => {
  const trimmed = source?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  const cached = getCachedUploadedUrl(shopDomain, trimmed);
  if (cached) {
    return cached;
  }

  const uploaded = await scheduleBackgroundMediaUpload(shopDomain, trimmed, profile);
  return uploaded;
};
