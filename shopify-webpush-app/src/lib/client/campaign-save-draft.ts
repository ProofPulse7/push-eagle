import type { QueryClient } from '@tanstack/react-query';

import { buildCampaignDateTime } from '@/lib/client/campaign-schedule';
import { parseApiResponse } from '@/lib/client/api-response';
import { cacheLaunchMedia, stageLaunchMedia } from '@/lib/client/campaign-launch-media-cache';
import { pickCampaignBarImageUrl } from '@/lib/client/campaign-bar-image';
import {
  prependOptimisticCampaign,
  patchOptimisticCampaign,
  replaceOptimisticCampaignId,
} from '@/lib/client/optimistic-campaigns';
import {
  cacheDraftWizardSnapshot,
  migrateDraftWizardSnapshot,
} from '@/lib/client/campaign-draft-cache';
import { queryKeys } from '@/lib/client/query-keys';
import {
  buildMergedLaunchMedia,
  prepareWizardLaunchMedia,
  readWizardLaunchMediaCache,
} from '@/lib/client/campaign-wizard-media';

export type CampaignDraftActionButton = {
  title: string;
  link: string;
};

export type SaveCampaignDraftInput = {
  shopDomain: string;
  draftCampaignId?: string | null;
  title: string;
  message: string;
  primaryLink?: string | null;
  segmentId: string;
  actionButtons: CampaignDraftActionButton[];
  logoPreview?: string | null;
  windowsHeroPreview?: string | null;
  macHeroPreview?: string | null;
  androidHeroPreview?: string | null;
  sendingOption?: string;
  scheduledDate?: Date;
  scheduledTime?: string;
  smartDeliver?: boolean;
  flashSaleEnabled?: boolean;
  flashSaleDiscountPercent?: number;
  flashSaleOriginalPrice?: number;
  flashSaleSalePrice?: number;
  flashSaleExpiresAt?: Date;
  flashSaleExpiresTime?: string;
  flashSaleUrgencyText?: string;
};

export type SaveCampaignDraftInstantResult = {
  campaignsHref: string;
  optimisticId: string;
};

const buildDeliveryPayload = (input: SaveCampaignDraftInput) => {
  const isScheduled = input.sendingOption === 'schedule';
  const scheduledAt = isScheduled
    ? buildCampaignDateTime(input.scheduledDate, input.scheduledTime ?? '09:00')
    : null;
  const flashSaleEndsAt = input.flashSaleEnabled
    ? buildCampaignDateTime(input.flashSaleExpiresAt, input.flashSaleExpiresTime ?? '23:59')
    : null;

  return {
    sendingOption: isScheduled ? ('schedule' as const) : ('now' as const),
    scheduledAt: scheduledAt?.toISOString() ?? null,
    smartDeliver: Boolean(input.smartDeliver),
    flashSaleEnabled: Boolean(input.flashSaleEnabled),
    flashSaleConfig: input.flashSaleEnabled
      ? {
          discountPercent: input.flashSaleDiscountPercent ?? 20,
          originalPrice: input.flashSaleOriginalPrice ?? 0,
          salePrice: input.flashSaleSalePrice ?? 0,
          expiresAt: flashSaleEndsAt?.toISOString() ?? null,
          urgencyText: input.flashSaleUrgencyText ?? '⏰ Limited time offer!',
        }
      : null,
  };
};

const buildDisplayMedia = (input: SaveCampaignDraftInput) => {
  const launchMedia = buildMergedLaunchMedia(readWizardLaunchMediaCache(input.shopDomain), {
    imageUrl: input.macHeroPreview ?? input.windowsHeroPreview ?? input.androidHeroPreview,
    windowsImageUrl: input.windowsHeroPreview,
    macosImageUrl: input.macHeroPreview,
    androidImageUrl: input.androidHeroPreview,
    iconUrl: input.logoPreview,
  });

  return {
    launchMedia,
    displayMedia: {
      imageUrl: launchMedia.imageUrl ?? input.macHeroPreview ?? input.windowsHeroPreview ?? input.androidHeroPreview,
      windowsImageUrl: launchMedia.windowsImageUrl ?? input.windowsHeroPreview,
      macosImageUrl: launchMedia.macosImageUrl ?? input.macHeroPreview,
      androidImageUrl: launchMedia.androidImageUrl ?? input.androidHeroPreview,
      iconUrl: launchMedia.iconUrl ?? input.logoPreview,
    },
  };
};

const buildApiPayload = (
  input: SaveCampaignDraftInput,
  media: {
    iconUrl: string | null;
    windowsImageUrl: string | null;
    macosImageUrl: string | null;
    androidImageUrl: string | null;
  },
) => {
  const delivery = buildDeliveryPayload(input);

  return {
    shopDomain: input.shopDomain,
    title: input.title.trim() || 'Untitled Campaign',
    body: input.message || '',
    targetUrl: input.primaryLink?.trim() || null,
    iconUrl: media.iconUrl,
    imageUrl: media.macosImageUrl,
    windowsImageUrl: media.windowsImageUrl,
    macosImageUrl: media.macosImageUrl,
    androidImageUrl: media.androidImageUrl,
    actionButtons: input.actionButtons
      .filter((button) => button.title?.trim() && button.link?.trim())
      .map((button) => ({ title: button.title.trim(), link: button.link.trim() })),
    segmentId: input.segmentId,
    status: 'draft' as const,
    scheduledAt: delivery.scheduledAt,
    delivery,
  };
};

const buildResponseError = (fallback: string, payload: { json: unknown | null; text: string }) => {
  const jsonError =
    payload.json && typeof payload.json === 'object' && payload.json !== null && 'error' in payload.json
      ? (payload.json as { error?: unknown }).error
      : null;

  if (typeof jsonError === 'string' && jsonError.trim()) {
    return jsonError;
  }

  if (payload.text.trim()) {
    return `${fallback} ${payload.text.slice(0, 180)}`.trim();
  }

  return fallback;
};

export const saveCampaignDraftInstantly = (
  input: SaveCampaignDraftInput,
  queryClient: QueryClient,
): SaveCampaignDraftInstantResult => {
  const isUpdate = Boolean(input.draftCampaignId);
  const optimisticId = input.draftCampaignId ?? crypto.randomUUID();
  const delivery = buildDeliveryPayload(input);
  const { launchMedia, displayMedia } = buildDisplayMedia(input);
  const listImageUrl = pickCampaignBarImageUrl({
    imageUrl: displayMedia.imageUrl,
    windowsImageUrl: displayMedia.windowsImageUrl,
    macosImageUrl: displayMedia.macosImageUrl,
    androidImageUrl: displayMedia.androidImageUrl,
  });

  const optimisticCampaign = {
    id: optimisticId,
    title: input.title.trim() || 'Untitled Campaign',
    body: input.message || '',
    image_url: listImageUrl,
    windows_image_url: displayMedia.windowsImageUrl,
    macos_image_url: displayMedia.macosImageUrl,
    android_image_url: displayMedia.androidImageUrl,
    icon_url: displayMedia.iconUrl,
    segment_id: input.segmentId,
    status: 'draft',
    created_at: new Date().toISOString(),
    scheduled_at: delivery.scheduledAt,
    delivery_count: 0,
    target_recipient_count: 0,
    click_count: 0,
    revenue_cents: 0,
  };

  if (isUpdate) {
    patchOptimisticCampaign(queryClient, input.shopDomain, optimisticId, optimisticCampaign);
  } else {
    prependOptimisticCampaign(queryClient, input.shopDomain, optimisticCampaign);
  }

  stageLaunchMedia(input.shopDomain, optimisticId, launchMedia);
  void cacheLaunchMedia(input.shopDomain, optimisticId, launchMedia).catch(() => undefined);
  cacheDraftWizardSnapshot(input.shopDomain, optimisticId, {
    ...input,
    draftCampaignId: isUpdate ? input.draftCampaignId ?? optimisticId : optimisticId,
  });

  return {
    campaignsHref: `/campaigns?shop=${encodeURIComponent(input.shopDomain)}&tab=draft`,
    optimisticId,
  };
};

export const runBackgroundCampaignDraftSave = async (
  input: SaveCampaignDraftInput,
  queryClient: QueryClient,
  optimisticId: string,
  onError?: (error: Error) => void,
) => {
  const isUpdate = Boolean(input.draftCampaignId);
  const { launchMedia } = buildDisplayMedia(input);

  try {
    const resolvedMedia = await prepareWizardLaunchMedia(input.shopDomain, launchMedia);
    const payload = buildApiPayload(input, {
      iconUrl: resolvedMedia.iconUrl ?? null,
      windowsImageUrl: resolvedMedia.windowsImageUrl ?? null,
      macosImageUrl: resolvedMedia.macosImageUrl ?? null,
      androidImageUrl: resolvedMedia.androidImageUrl ?? null,
    });

    const shopQuery = `shop=${encodeURIComponent(input.shopDomain)}`;
    const response = await fetch(
      isUpdate
        ? `/api/campaigns/${encodeURIComponent(String(input.draftCampaignId))}?${shopQuery}`
        : `/api/campaigns?${shopQuery}`,
      {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    const resultPayload = await parseApiResponse(response);
    const result = resultPayload.json as { ok?: boolean; error?: string; campaign?: { id?: string; created_at?: string } } | null;

    if (!response.ok || !result?.ok || !result?.campaign?.id) {
      throw new Error(buildResponseError('Failed to save draft.', resultPayload));
    }

    const campaignId = String(result.campaign.id);
    const listImageUrl = pickCampaignBarImageUrl({
      imageUrl: resolvedMedia.macosImageUrl ?? resolvedMedia.imageUrl,
      windowsImageUrl: resolvedMedia.windowsImageUrl,
      macosImageUrl: resolvedMedia.macosImageUrl,
      androidImageUrl: resolvedMedia.androidImageUrl,
    });

    const cachedMedia = await cacheLaunchMedia(input.shopDomain, campaignId, resolvedMedia);

    const savedCampaign = {
      id: campaignId,
      title: payload.title,
      body: payload.body,
      image_url: pickCampaignBarImageUrl({
        imageUrl: cachedMedia.imageUrl ?? listImageUrl,
        windowsImageUrl: cachedMedia.windowsImageUrl ?? resolvedMedia.windowsImageUrl,
        macosImageUrl: cachedMedia.macosImageUrl ?? resolvedMedia.macosImageUrl,
        androidImageUrl: cachedMedia.androidImageUrl ?? resolvedMedia.androidImageUrl,
      }),
      windows_image_url: cachedMedia.windowsImageUrl ?? resolvedMedia.windowsImageUrl,
      macos_image_url: cachedMedia.macosImageUrl ?? resolvedMedia.macosImageUrl,
      android_image_url: cachedMedia.androidImageUrl ?? resolvedMedia.androidImageUrl,
      icon_url: cachedMedia.iconUrl ?? resolvedMedia.iconUrl,
      segment_id: input.segmentId,
      status: 'draft',
      created_at: String(result.campaign.created_at ?? new Date().toISOString()),
      scheduled_at: payload.delivery.scheduledAt,
      delivery_count: 0,
      target_recipient_count: 0,
      click_count: 0,
      revenue_cents: 0,
    };

    if (isUpdate) {
      patchOptimisticCampaign(queryClient, input.shopDomain, campaignId, savedCampaign);
      cacheDraftWizardSnapshot(input.shopDomain, campaignId, {
        ...input,
        draftCampaignId: campaignId,
      });
    } else {
      replaceOptimisticCampaignId(queryClient, input.shopDomain, optimisticId, savedCampaign);
      migrateDraftWizardSnapshot(input.shopDomain, optimisticId, campaignId);
      cacheDraftWizardSnapshot(input.shopDomain, campaignId, {
        ...input,
        draftCampaignId: campaignId,
      });
    }

    void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns(input.shopDomain) });
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error('Failed to save draft.');
    onError?.(normalized);
    throw normalized;
  }
};

export const commitCampaignDraftSave = (
  input: SaveCampaignDraftInput,
  queryClient: QueryClient,
  options?: {
    onNavigate?: (campaignsHref: string) => void;
    onError?: (error: Error) => void;
  },
): SaveCampaignDraftInstantResult => {
  const result = saveCampaignDraftInstantly(input, queryClient);
  options?.onNavigate?.(result.campaignsHref);
  void runBackgroundCampaignDraftSave(input, queryClient, result.optimisticId, options?.onError);
  return result;
};

/** @deprecated Use saveCampaignDraftInstantly + runBackgroundCampaignDraftSave */
export const saveCampaignDraft = async (
  input: SaveCampaignDraftInput,
  queryClient?: QueryClient,
): Promise<{ campaignId: string; campaignsHref: string }> => {
  if (!queryClient) {
    throw new Error('Query client is required.');
  }

  const { campaignsHref, optimisticId } = saveCampaignDraftInstantly(input, queryClient);
  await runBackgroundCampaignDraftSave(input, queryClient, optimisticId);
  return { campaignId: optimisticId, campaignsHref };
};
