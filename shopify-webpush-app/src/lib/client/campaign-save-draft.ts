import type { QueryClient } from '@tanstack/react-query';

import { buildCampaignDateTime } from '@/lib/client/campaign-schedule';
import { resolveCampaignMediaUrl } from '@/lib/client/campaign-media-url';
import { prependOptimisticCampaign, patchOptimisticCampaign } from '@/lib/client/optimistic-campaigns';
import { pickCampaignBarImageUrl } from '@/lib/client/campaign-bar-image';
import { queryKeys } from '@/lib/client/query-keys';

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

export type SaveCampaignDraftResult = {
  campaignId: string;
  campaignsHref: string;
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

export const saveCampaignDraft = async (
  input: SaveCampaignDraftInput,
  queryClient?: QueryClient,
): Promise<SaveCampaignDraftResult> => {
  const [iconUrl, windowsImageUrl, macosImageUrl, androidImageUrl] = await Promise.all([
    resolveCampaignMediaUrl(input.logoPreview, input.shopDomain),
    resolveCampaignMediaUrl(input.windowsHeroPreview, input.shopDomain),
    resolveCampaignMediaUrl(input.macHeroPreview, input.shopDomain),
    resolveCampaignMediaUrl(input.androidHeroPreview, input.shopDomain),
  ]);

  const delivery = buildDeliveryPayload(input);
  const payload = {
    shopDomain: input.shopDomain,
    title: input.title.trim() || 'Untitled Campaign',
    body: input.message || '',
    targetUrl: input.primaryLink?.trim() || null,
    iconUrl,
    imageUrl: macosImageUrl,
    windowsImageUrl,
    macosImageUrl,
    androidImageUrl,
    actionButtons: input.actionButtons
      .filter((button) => button.title?.trim() && button.link?.trim())
      .map((button) => ({ title: button.title.trim(), link: button.link.trim() })),
    segmentId: input.segmentId,
    status: 'draft' as const,
    scheduledAt: delivery.scheduledAt,
    delivery,
  };

  const isUpdate = Boolean(input.draftCampaignId);
  const response = await fetch(
    isUpdate ? `/api/campaigns/${encodeURIComponent(String(input.draftCampaignId))}` : '/api/campaigns',
    {
      method: isUpdate ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  const result = await response.json();
  if (!response.ok || !result?.ok || !result?.campaign?.id) {
    throw new Error(typeof result?.error === 'string' ? result.error : 'Failed to save draft.');
  }

  const campaignId = String(result.campaign.id);
  const listImageUrl = pickCampaignBarImageUrl({
    imageUrl: macosImageUrl,
    windowsImageUrl,
    macosImageUrl,
    androidImageUrl,
  });

  if (queryClient) {
    const optimisticCampaign = {
      id: campaignId,
      title: payload.title,
      body: payload.body,
      image_url: listImageUrl,
      windows_image_url: windowsImageUrl,
      macos_image_url: macosImageUrl,
      android_image_url: androidImageUrl,
      icon_url: iconUrl,
      segment_id: input.segmentId,
      status: 'draft',
      created_at: String(result.campaign.created_at ?? new Date().toISOString()),
      scheduled_at: delivery.scheduledAt,
      delivery_count: 0,
      target_recipient_count: 0,
      click_count: 0,
      revenue_cents: 0,
    };

    if (isUpdate) {
      patchOptimisticCampaign(queryClient, input.shopDomain, campaignId, optimisticCampaign);
    } else {
      prependOptimisticCampaign(queryClient, input.shopDomain, optimisticCampaign);
    }

    void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns(input.shopDomain) });
  }

  const campaignsHref = `/campaigns?shop=${encodeURIComponent(input.shopDomain)}&tab=draft`;

  return { campaignId, campaignsHref };
};
