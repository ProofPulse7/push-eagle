import type { CampaignDraftSnapshot } from '@/lib/client/campaign-draft-storage';
import type { SaveCampaignDraftInput } from '@/lib/client/campaign-save-draft';
import { getDefaultCampaignScheduleDefaults } from '@/lib/client/campaign-schedule';
import { migrateLaunchMedia, readLaunchMedia } from '@/lib/client/campaign-launch-media-cache';
import { readOptimisticReplacements } from '@/lib/client/campaign-launch-media-cache';

type StoredDraftWizardSnapshot = Omit<
  SaveCampaignDraftInput,
  'scheduledDate' | 'flashSaleExpiresAt'
> & {
  scheduledDate?: string | null;
  flashSaleExpiresAt?: string | null;
  cachedAt?: number;
};

const snapshotKey = (shop: string, campaignId: string) =>
  `pe:draft-wizard:${shop.trim().toLowerCase()}:${campaignId}`;

const serializeSnapshot = (input: SaveCampaignDraftInput): StoredDraftWizardSnapshot => ({
  ...input,
  scheduledDate: input.scheduledDate?.toISOString() ?? null,
  flashSaleExpiresAt: input.flashSaleExpiresAt?.toISOString() ?? null,
  cachedAt: Date.now(),
});

const deserializeSnapshot = (stored: StoredDraftWizardSnapshot): SaveCampaignDraftInput => ({
  ...stored,
  scheduledDate: stored.scheduledDate ? new Date(stored.scheduledDate) : undefined,
  flashSaleExpiresAt: stored.flashSaleExpiresAt ? new Date(stored.flashSaleExpiresAt) : undefined,
});

export const cacheDraftWizardSnapshot = (
  shop: string,
  campaignId: string,
  input: SaveCampaignDraftInput,
) => {
  if (typeof window === 'undefined' || !shop.trim() || !campaignId) {
    return;
  }

  try {
    sessionStorage.setItem(snapshotKey(shop, campaignId), JSON.stringify(serializeSnapshot(input)));
  } catch {
    // Ignore storage quota errors.
  }
};

export const readDraftWizardSnapshot = (
  shop: string,
  campaignId: string,
): SaveCampaignDraftInput | null => {
  if (typeof window === 'undefined' || !shop.trim() || !campaignId) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(snapshotKey(shop, campaignId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as StoredDraftWizardSnapshot;
    return parsed && typeof parsed === 'object' ? deserializeSnapshot(parsed) : null;
  } catch {
    return null;
  }
};

export const migrateDraftWizardSnapshot = (shop: string, optimisticId: string, realId: string) => {
  if (typeof window === 'undefined' || !shop.trim() || !optimisticId || !realId) {
    return;
  }

  const snapshot = readDraftWizardSnapshot(shop, optimisticId);
  if (!snapshot) {
    return;
  }

  cacheDraftWizardSnapshot(shop, realId, {
    ...snapshot,
    draftCampaignId: realId,
  });

  try {
    sessionStorage.removeItem(snapshotKey(shop, optimisticId));
  } catch {
    // Ignore storage errors.
  }

  migrateLaunchMedia(shop, optimisticId, realId);
};

export const resolvePersistedDraftCampaignId = (shop: string, campaignId: string) => {
  const replacements = readOptimisticReplacements(shop);
  return replacements[campaignId] ?? campaignId;
};

export const findCachedDraftWizardSnapshot = (
  shop: string,
  campaignId: string,
): SaveCampaignDraftInput | null => {
  const direct = readDraftWizardSnapshot(shop, campaignId);
  if (direct) {
    return direct;
  }

  const replacements = readOptimisticReplacements(shop);
  for (const [optimisticId, realId] of Object.entries(replacements)) {
    if (realId === campaignId) {
      const optimisticSnapshot = readDraftWizardSnapshot(shop, optimisticId);
      if (optimisticSnapshot) {
        return { ...optimisticSnapshot, draftCampaignId: realId };
      }
    }
  }

  for (const [optimisticId, realId] of Object.entries(replacements)) {
    if (optimisticId === campaignId) {
      const realSnapshot = readDraftWizardSnapshot(shop, realId);
      if (realSnapshot) {
        return { ...realSnapshot, draftCampaignId: realId };
      }
    }
  }

  return null;
};

export const buildDraftSnapshotFromSaveInput = (
  input: SaveCampaignDraftInput,
  campaignId: string,
): CampaignDraftSnapshot => {
  const defaults = getDefaultCampaignScheduleDefaults();
  const media = readLaunchMedia(input.shopDomain, campaignId);

  return {
    draftCampaignId: resolvePersistedDraftCampaignId(input.shopDomain, campaignId),
    title: input.title,
    message: input.message,
    primaryLink: input.primaryLink?.trim() ?? '',
    actionButtons: input.actionButtons,
    windowsHero: {
      preview: media?.windowsImageUrl ?? input.windowsHeroPreview ?? null,
      originalPreview: media?.windowsImageUrl ?? input.windowsHeroPreview ?? null,
    },
    macHero: {
      preview: media?.macosImageUrl ?? media?.imageUrl ?? input.macHeroPreview ?? null,
      originalPreview: media?.macosImageUrl ?? media?.imageUrl ?? input.macHeroPreview ?? null,
    },
    androidHero: {
      preview: media?.androidImageUrl ?? input.androidHeroPreview ?? null,
      originalPreview: media?.androidImageUrl ?? input.androidHeroPreview ?? null,
    },
    logo: {
      preview: media?.iconUrl ?? input.logoPreview ?? null,
      originalPreview: media?.iconUrl ?? input.logoPreview ?? null,
    },
    sendingOption: input.sendingOption ?? 'now',
    scheduledDate: input.scheduledDate
      ? input.scheduledDate.toISOString()
      : defaults.scheduledDate.toISOString(),
    scheduledTime: input.scheduledTime ?? defaults.scheduledTime,
    segmentId: input.segmentId,
    smartDeliver: Boolean(input.smartDeliver),
    flashSaleEnabled: Boolean(input.flashSaleEnabled),
    flashSaleDiscountPercent: input.flashSaleDiscountPercent ?? 20,
    flashSaleOriginalPrice: input.flashSaleOriginalPrice ?? 0,
    flashSaleSalePrice: input.flashSaleSalePrice ?? 0,
    flashSaleExpiresAt: input.flashSaleExpiresAt
      ? input.flashSaleExpiresAt.toISOString()
      : defaults.flashSaleExpiresAt.toISOString(),
    flashSaleExpiresTime: input.flashSaleExpiresTime ?? defaults.flashSaleExpiresTime,
    flashSaleUrgencyText: input.flashSaleUrgencyText ?? '⏰ Limited time offer!',
    recurringPattern: '',
    updatedAt: Date.now(),
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchDraftCampaignWithRetry = async (
  shopDomain: string,
  campaignId: string,
  maxAttempts = 6,
) => {
  const resolvedId = resolvePersistedDraftCampaignId(shopDomain, campaignId);
  let lastError = 'Failed to load draft campaign.';

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(resolvedId)}?shop=${encodeURIComponent(shopDomain)}`,
    );
    const payload = await response.json().catch(() => null);

    if (response.ok && payload?.ok && payload?.campaign) {
      return payload.campaign as Record<string, unknown>;
    }

    lastError =
      payload && typeof payload === 'object' && typeof payload.error === 'string'
        ? payload.error
        : 'Failed to load draft campaign.';

    if (response.status === 404 && attempt < maxAttempts - 1) {
      await sleep(350 * (attempt + 1));
      continue;
    }

    break;
  }

  throw new Error(lastError);
};
