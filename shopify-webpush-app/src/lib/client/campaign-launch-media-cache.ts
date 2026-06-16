'use client';

export type LaunchMediaCache = {
  imageUrl?: string | null;
  windowsImageUrl?: string | null;
  macosImageUrl?: string | null;
  androidImageUrl?: string | null;
  iconUrl?: string | null;
};

const mediaKey = (shop: string, campaignId: string) =>
  `pe:launch-media:${shop.trim().toLowerCase()}:${campaignId}`;

const replacementKey = (shop: string) => `pe:optimistic-campaign-map:${shop.trim().toLowerCase()}`;

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(blob);
  });

const normalizeMediaSource = async (value: string | null | undefined): Promise<string | null> => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('data:')) {
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

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return null;
};

export const cacheLaunchMedia = async (
  shop: string,
  campaignId: string,
  media: LaunchMediaCache,
): Promise<LaunchMediaCache> => {
  if (typeof window === 'undefined' || !shop.trim() || !campaignId) {
    return media;
  }

  const [imageUrl, windowsImageUrl, macosImageUrl, androidImageUrl, iconUrl] = await Promise.all([
    normalizeMediaSource(media.imageUrl),
    normalizeMediaSource(media.windowsImageUrl),
    normalizeMediaSource(media.macosImageUrl),
    normalizeMediaSource(media.androidImageUrl),
    normalizeMediaSource(media.iconUrl),
  ]);

  const cached: LaunchMediaCache = {
    imageUrl: imageUrl ?? macosImageUrl ?? windowsImageUrl ?? androidImageUrl,
    windowsImageUrl,
    macosImageUrl,
    androidImageUrl,
    iconUrl,
  };

  try {
    sessionStorage.setItem(mediaKey(shop, campaignId), JSON.stringify(cached));
  } catch {
    // Ignore storage quota errors.
  }

  return cached;
};

export const readLaunchMedia = (shop: string, campaignId: string): LaunchMediaCache | null => {
  if (typeof window === 'undefined' || !shop.trim() || !campaignId) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(mediaKey(shop, campaignId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as LaunchMediaCache;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const migrateLaunchMedia = (shop: string, optimisticId: string, realId: string) => {
  if (typeof window === 'undefined' || !shop.trim() || !optimisticId || !realId) {
    return;
  }

  const cached = readLaunchMedia(shop, optimisticId);
  if (!cached) {
    return;
  }

  try {
    sessionStorage.setItem(mediaKey(shop, realId), JSON.stringify(cached));
    sessionStorage.removeItem(mediaKey(shop, optimisticId));
  } catch {
    // Ignore storage quota errors.
  }
};

export const registerOptimisticReplacement = (shop: string, optimisticId: string, realId: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    const raw = sessionStorage.getItem(replacementKey(shop));
    const map = raw && typeof JSON.parse(raw) === 'object'
      ? (JSON.parse(raw) as Record<string, string>)
      : {};

    map[optimisticId] = realId;
    sessionStorage.setItem(replacementKey(shop), JSON.stringify(map));
  } catch {
    // Ignore storage quota errors.
  }
};

export const readOptimisticReplacements = (shop: string): Record<string, string> => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return {};
  }

  try {
    const raw = sessionStorage.getItem(replacementKey(shop));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
};

export const applyLaunchMediaToCampaign = (
  shop: string,
  campaign: Record<string, unknown>,
): Record<string, unknown> => {
  const id = String(campaign.id ?? '');
  if (!id) {
    return campaign;
  }

  const cached = readLaunchMedia(shop, id);
  if (!cached) {
    return campaign;
  }

  const pick = (current: unknown, fallback?: string | null) => {
    const value = String(current ?? '').trim();
    if (value.startsWith('blob:') || !value) {
      return fallback ?? value;
    }
    return value;
  };

  return {
    ...campaign,
    image_url: pick(campaign.image_url ?? campaign.imageUrl, cached.imageUrl),
    windows_image_url: pick(campaign.windows_image_url ?? campaign.windowsImageUrl, cached.windowsImageUrl),
    macos_image_url: pick(campaign.macos_image_url ?? campaign.macosImageUrl, cached.macosImageUrl),
    android_image_url: pick(campaign.android_image_url ?? campaign.androidImageUrl, cached.androidImageUrl),
    icon_url: pick(campaign.icon_url ?? campaign.iconUrl, cached.iconUrl),
  };
};
