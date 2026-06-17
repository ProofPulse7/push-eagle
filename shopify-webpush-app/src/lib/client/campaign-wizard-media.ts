'use client';

import type { LaunchMediaCache } from '@/lib/client/campaign-launch-media-cache';

type WizardMediaSlot = keyof LaunchMediaCache;

const cacheKey = (shop: string) => `pe:wizard-launch-media:${shop.trim().toLowerCase()}`;
const sourceKey = (shop: string) => `pe:wizard-launch-media-src:${shop.trim().toLowerCase()}`;

type WizardLaunchMediaCache = LaunchMediaCache & {
  __sources?: Partial<Record<WizardMediaSlot, string>>;
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(blob);
  });

export const readPersistableImageSource = async (value: string | null | undefined): Promise<string | null> => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }

  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  if (trimmed.startsWith('blob:')) {
    try {
      const response = await fetch(trimmed);
      const blob = await response.blob();
      return blobToDataUrl(blob);
    } catch {
      return null;
    }
  }

  return null;
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

const resolveUploadedUrl = async (shopDomain: string, value: string | null | undefined): Promise<string | null> => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }

  const dataUrl = await readPersistableImageSource(trimmed);
  if (!dataUrl?.startsWith('data:image/')) {
    return null;
  }

  return uploadDataUrl(shopDomain, dataUrl);
};

export const readWizardLaunchMediaCache = (shop: string): LaunchMediaCache | null => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(cacheKey(shop));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as WizardLaunchMediaCache;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const { __sources: _sources, ...media } = parsed;
    return media;
  } catch {
    return null;
  }
};

const readWizardLaunchMediaBundle = (shop: string): WizardLaunchMediaCache | null => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(cacheKey(shop));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as WizardLaunchMediaCache;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writeWizardLaunchMediaCache = (shop: string, media: LaunchMediaCache, sources: Partial<Record<WizardMediaSlot, string>>) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    const payload: WizardLaunchMediaCache = {
      ...media,
      __sources: sources,
    };
    sessionStorage.setItem(cacheKey(shop), JSON.stringify(payload));
  } catch {
    // Ignore quota errors.
  }
};

export const clearWizardLaunchMediaCache = (shop: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    sessionStorage.removeItem(cacheKey(shop));
    sessionStorage.removeItem(sourceKey(shop));
  } catch {
    // Ignore storage errors.
  }
};

const slotMatches = (
  cachedSource: string | null | undefined,
  cachedUrl: string | null | undefined,
  source: string | null | undefined,
) => {
  const nextSource = String(source ?? '').trim();
  const previousSource = String(cachedSource ?? '').trim();
  const previousUrl = String(cachedUrl ?? '').trim();

  if (!nextSource || !previousUrl) {
    return false;
  }

  if (previousSource && previousSource === nextSource) {
    return true;
  }

  return previousUrl === nextSource;
};

export const prepareWizardLaunchMedia = async (
  shopDomain: string,
  media: LaunchMediaCache,
): Promise<LaunchMediaCache> => {
  if (!shopDomain.trim()) {
    return media;
  }

  const cached = readWizardLaunchMediaBundle(shopDomain);
  const sourceEntries: Array<[WizardMediaSlot, string | null | undefined]> = [
    ['windowsImageUrl', media.windowsImageUrl],
    ['macosImageUrl', media.macosImageUrl],
    ['androidImageUrl', media.androidImageUrl],
    ['iconUrl', media.iconUrl],
    ['imageUrl', media.imageUrl],
  ];

  const resolved: LaunchMediaCache = {};
  const sources: Partial<Record<WizardMediaSlot, string>> = {};
  const tasks = sourceEntries.map(async ([slot, source]) => {
    const trimmed = source?.trim();
    if (!trimmed) {
      return;
    }

    sources[slot] = trimmed;

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      resolved[slot] = trimmed;
      return;
    }

    const cachedValue = cached?.[slot];
    const cachedSource = cached?.__sources?.[slot];
    if (slotMatches(cachedSource, cachedValue, trimmed)) {
      resolved[slot] = cachedValue ?? null;
      return;
    }

    resolved[slot] = await resolveUploadedUrl(shopDomain, trimmed);
  });

  await Promise.all(tasks);

  resolved.imageUrl =
    resolved.imageUrl
    ?? resolved.macosImageUrl
    ?? resolved.windowsImageUrl
    ?? resolved.androidImageUrl
    ?? null;

  writeWizardLaunchMediaCache(shopDomain, resolved, sources);
  return resolved;
};

export const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
