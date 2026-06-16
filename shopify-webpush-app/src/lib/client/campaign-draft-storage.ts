'use client';

type StoredImage = {
  preview: string | null;
  originalPreview?: string | null;
};

export type CampaignDraftSnapshot = {
  title: string;
  message: string;
  primaryLink: string;
  actionButtons: Array<{ title: string; link: string }>;
  windowsHero: StoredImage;
  macHero: StoredImage;
  androidHero: StoredImage;
  logo: StoredImage;
  sendingOption: string;
  scheduledDateIso: string | null;
  scheduledTime: string;
  segmentId: string;
  smartDeliver: boolean;
  flashSaleEnabled: boolean;
  flashSaleDiscountPercent: number;
  flashSaleOriginalPrice: number;
  flashSaleSalePrice: number;
  flashSaleExpiresAtIso: string | null;
  flashSaleUrgencyText: string;
  recurringPattern: string;
  updatedAt: number;
};

const draftKey = (shop: string) => `pe:campaign-draft:${shop.trim().toLowerCase()}`;

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(blob);
  });

const normalizePreviewForStorage = async (value: string | null | undefined): Promise<string | null> => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
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

  return trimmed;
};

const normalizeStoredImage = async (image: StoredImage): Promise<StoredImage> => {
  const [preview, originalPreview] = await Promise.all([
    normalizePreviewForStorage(image.preview),
    normalizePreviewForStorage(image.originalPreview),
  ]);

  return {
    preview,
    originalPreview: originalPreview ?? preview,
  };
};

export const readCampaignDraft = (shop: string): CampaignDraftSnapshot | null => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(draftKey(shop));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CampaignDraftSnapshot;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const persistCampaignDraft = async (
  shop: string,
  snapshot: Omit<CampaignDraftSnapshot, 'updatedAt'>,
): Promise<void> => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  const [windowsHero, macHero, androidHero, logo] = await Promise.all([
    normalizeStoredImage(snapshot.windowsHero),
    normalizeStoredImage(snapshot.macHero),
    normalizeStoredImage(snapshot.androidHero),
    normalizeStoredImage(snapshot.logo),
  ]);

  const payload: CampaignDraftSnapshot = {
    ...snapshot,
    windowsHero,
    macHero,
    androidHero,
    logo,
    updatedAt: Date.now(),
  };

  try {
    sessionStorage.setItem(draftKey(shop), JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors.
  }
};

export const clearCampaignDraft = (shop: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    sessionStorage.removeItem(draftKey(shop));
  } catch {
    // Ignore storage errors.
  }
};

export const draftImageToImageValue = (image: StoredImage) => ({
  file: null as File | null,
  preview: image.preview,
  originalPreview: image.originalPreview ?? image.preview,
});
