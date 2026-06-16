'use client';

import type { QueryClient } from '@tanstack/react-query';

type CampaignMediaInput = {
  logoPreview: string | null;
  windowsHeroPreview: string | null;
  macHeroPreview: string | null;
  androidHeroPreview: string | null;
};

type PersistCampaignInput = CampaignMediaInput & {
  shopDomain: string;
  editingCampaignId: string | null;
  title: string;
  message: string;
  primaryLink: string;
  segmentId: string;
  actionButtons: Array<{ title: string; link: string }>;
  status: 'draft' | 'scheduled';
  scheduledAt: string | null;
};

const parseApiResponse = async (response: Response): Promise<{ json: Record<string, unknown> | null; text: string }> => {
  const text = await response.text();
  if (!text) {
    return { json: null, text: '' };
  }

  try {
    return { json: JSON.parse(text) as Record<string, unknown>, text };
  } catch {
    return { json: null, text };
  }
};

const buildResponseError = (fallback: string, payload: { json: Record<string, unknown> | null; text: string }) => {
  const jsonError = payload.json?.error;
  if (typeof jsonError === 'string' && jsonError.trim()) {
    return jsonError;
  }
  if (payload.text) {
    return `${fallback} ${payload.text.slice(0, 180)}`;
  }
  return fallback;
};

const sanitizeMediaUrl = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return null;
  }
  return trimmed;
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ''));
  reader.onerror = () => reject(new Error('Failed to read image blob.'));
  reader.readAsDataURL(blob);
});

export const resolveCampaignMediaUrl = async (
  sourceUrl: string | null | undefined,
  shopDomain: string,
): Promise<string | null> => {
  const direct = sanitizeMediaUrl(sourceUrl);
  if (direct) {
    return direct;
  }

  const value = sourceUrl?.trim();
  if (!value || !value.startsWith('blob:')) {
    return null;
  }

  const response = await fetch(value);
  const blob = await response.blob();
  const dataUrl = await blobToDataUrl(blob);
  if (!dataUrl.startsWith('data:image/')) {
    return null;
  }

  const uploadResponse = await fetch('/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopDomain, dataUrl }),
  });

  const uploadPayload = await parseApiResponse(uploadResponse);
  if (!uploadResponse.ok || !uploadPayload.json?.ok || !uploadPayload.json?.asset) {
    throw new Error(buildResponseError('Failed to upload campaign image.', uploadPayload));
  }

  const asset = uploadPayload.json.asset as { url?: string };
  return asset.url ? String(asset.url) : null;
};

export const resolveCampaignMediaBundle = async (
  media: CampaignMediaInput,
  shopDomain: string,
) => {
  return Promise.all([
    resolveCampaignMediaUrl(media.logoPreview, shopDomain),
    resolveCampaignMediaUrl(media.windowsHeroPreview, shopDomain),
    resolveCampaignMediaUrl(media.macHeroPreview, shopDomain),
    resolveCampaignMediaUrl(media.androidHeroPreview, shopDomain),
  ]);
};

export const persistCampaignRecord = async (input: PersistCampaignInput): Promise<string> => {
  const [iconUrl, windowsImageUrl, macosImageUrl, androidImageUrl] = await resolveCampaignMediaBundle(
    {
      logoPreview: input.logoPreview,
      windowsHeroPreview: input.windowsHeroPreview,
      macHeroPreview: input.macHeroPreview,
      androidHeroPreview: input.androidHeroPreview,
    },
    input.shopDomain,
  );

  const payload = {
    shopDomain: input.shopDomain,
    title: input.title || 'Untitled Campaign',
    body: input.message || ' ',
    targetUrl: input.primaryLink || null,
    iconUrl,
    imageUrl: macosImageUrl,
    windowsImageUrl,
    macosImageUrl,
    androidImageUrl,
    actionButtons: input.actionButtons
      .filter((button) => button.title?.trim() && button.link?.trim())
      .map((button) => ({ title: button.title.trim(), link: button.link.trim() })),
    segmentId: input.segmentId || 'all',
    status: input.status,
    scheduledAt: input.scheduledAt,
  };

  if (input.editingCampaignId) {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(input.editingCampaignId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const parsed = await parseApiResponse(response);
    if (!response.ok || !parsed.json?.ok) {
      throw new Error(buildResponseError('Failed to update campaign.', parsed));
    }
    return input.editingCampaignId;
  }

  const response = await fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const parsed = await parseApiResponse(response);
  const campaign = parsed.json?.campaign as { id?: string } | undefined;
  if (!response.ok || !parsed.json?.ok || !campaign?.id) {
    throw new Error(buildResponseError('Failed to create campaign.', parsed));
  }

  return String(campaign.id);
};

export const sendCampaignNow = async (shopDomain: string, campaignId: string) => {
  const response = await fetch('/api/campaigns/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaignId,
      shopDomain,
      maxBatches: 2000,
      async: false,
    }),
  });

  const parsed = await parseApiResponse(response);
  if (!response.ok || !parsed.json?.ok) {
    throw new Error(buildResponseError('Failed to send campaign.', parsed));
  }

  return parsed.json;
};

export const refreshCampaignQueries = (queryClient: QueryClient, shop: string) => {
  void import('@/lib/client/query-keys').then(({ queryKeys }) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns(shop) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboardSummary(shop) });
  });
};
