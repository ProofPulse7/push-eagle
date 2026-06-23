'use client';

import type { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/lib/client/api-fetch';
import { parseApiResponse } from '@/lib/client/api-response';
import {
  cacheLaunchMedia,
  type LaunchMediaCache,
} from '@/lib/client/campaign-launch-media-cache';
import {
  clearWizardLaunchMediaCache,
  prepareWizardLaunchMedia,
} from '@/lib/client/campaign-wizard-media';
import {
  patchOptimisticCampaign,
  replaceOptimisticCampaignId,
} from '@/lib/client/optimistic-campaigns';
import { prefetchAppBootstrap } from '@/lib/client/query-fetchers';
import { queryKeys } from '@/lib/client/query-keys';

export const CAMPAIGN_LAUNCH_MAX_ATTEMPTS = 6;
export const CAMPAIGN_LAUNCH_FAILURE_EVENT = 'pe:campaign-launch-failure';

export type CampaignDeliveryPayload = {
  sendingOption: 'now' | 'schedule';
  scheduledAt: string | null;
  smartDeliver: boolean;
  flashSaleEnabled: boolean;
  flashSaleConfig: Record<string, unknown> | null;
};

export type CampaignLaunchPayload = {
  shopDomain: string;
  optimisticId: string;
  draftCampaignId?: string | null;
  title: string;
  message: string;
  primaryLink: string;
  segmentId: string | null;
  actionButtons: Array<{ title: string; link: string }>;
  deliveryPayload: CampaignDeliveryPayload;
  launchMedia: LaunchMediaCache;
  displayMedia: LaunchMediaCache;
  launchingExistingDraft: boolean;
  isScheduled: boolean;
  scheduledAt: string | null;
  segmentSubscriberCount: number;
  startedAt: string;
};

const pendingLaunchKey = (shop: string) => `pe:pending-campaign-launch:${shop.trim().toLowerCase()}`;
const launchFailureKey = (shop: string) => `pe:campaign-launch-failure:${shop.trim().toLowerCase()}`;

const inFlightLaunches = new Map<string, Promise<void>>();

const buildResponseError = (fallback: string, payload: { json: unknown | null; text: string }) => {
  const jsonError =
    payload.json && typeof payload.json === 'object'
      ? (payload.json as Record<string, unknown>).error
      : null;
  if (typeof jsonError === 'string' && jsonError.trim()) {
    return jsonError.trim();
  }

  if (payload.text.trim()) {
    return payload.text.trim();
  }

  return fallback;
};

const isLaunchRetryableError = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.status === 0 || error.status === 401 || error.status === 429 || error.status >= 500;
  }

  return true;
};

export const persistPendingCampaignLaunch = (shop: string, payload: CampaignLaunchPayload) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    sessionStorage.setItem(pendingLaunchKey(shop), JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors.
  }
};

export const readPendingCampaignLaunch = (shop: string): CampaignLaunchPayload | null => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(pendingLaunchKey(shop));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CampaignLaunchPayload;
    return parsed?.shopDomain && parsed?.optimisticId ? parsed : null;
  } catch {
    return null;
  }
};

export const clearPendingCampaignLaunch = (shop: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    sessionStorage.removeItem(pendingLaunchKey(shop));
  } catch {
    // Ignore storage errors.
  }
};

export const readCampaignLaunchFailure = (shop: string): string | null => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return null;
  }

  try {
    return sessionStorage.getItem(launchFailureKey(shop));
  } catch {
    return null;
  }
};

export const clearCampaignLaunchFailure = (shop: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    sessionStorage.removeItem(launchFailureKey(shop));
  } catch {
    // Ignore storage errors.
  }
};

const notifyCampaignLaunchFailure = (shop: string, message: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    sessionStorage.setItem(launchFailureKey(shop), message);
  } catch {
    // Ignore storage errors.
  }

  window.dispatchEvent(
    new CustomEvent(CAMPAIGN_LAUNCH_FAILURE_EVENT, {
      detail: { shop, message },
    }),
  );
};

const postCampaignLaunch = async (payload: CampaignLaunchPayload, resolvedMedia: LaunchMediaCache) => {
  const response = await fetch('/api/campaigns/launch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shopDomain: payload.shopDomain,
      campaignId: payload.draftCampaignId ?? undefined,
      title: payload.title || 'Untitled Campaign',
      body: payload.message || ' ',
      targetUrl: payload.primaryLink || '',
      segmentId: payload.segmentId,
      media: resolvedMedia,
      actionButtons: payload.actionButtons,
      maxBatches: 2000,
      delivery: payload.deliveryPayload,
    }),
  });

  const launchResultPayload = await parseApiResponse(response);
  const launchResult = launchResultPayload.json as Record<string, unknown> | null;
  if (!response.ok || !launchResult?.ok || !launchResult?.campaignId) {
    throw new Error(buildResponseError('Failed to launch campaign.', launchResultPayload));
  }

  return launchResult;
};

const applySuccessfulLaunch = async (
  queryClient: QueryClient,
  payload: CampaignLaunchPayload,
  launchResult: Record<string, unknown>,
  resolvedMedia: LaunchMediaCache,
) => {
  const campaignId = String(launchResult.campaignId);
  const resolvedTargetCount = Number(
    launchResult.recipientCount
      ?? launchResult.targetRecipientCount
      ?? payload.segmentSubscriberCount
      ?? 0,
  );
  const resolvedStatus = launchResult.scheduled ? 'scheduled' : 'queued';

  const cachedMedia = await cacheLaunchMedia(payload.shopDomain, campaignId, resolvedMedia);

  const launchedCampaign = {
    id: campaignId,
    title: payload.title || 'Untitled Campaign',
    body: payload.message || '',
    image_url: cachedMedia.imageUrl ?? resolvedMedia.imageUrl ?? payload.displayMedia.imageUrl,
    windows_image_url:
      cachedMedia.windowsImageUrl ?? resolvedMedia.windowsImageUrl ?? payload.displayMedia.windowsImageUrl,
    macos_image_url:
      cachedMedia.macosImageUrl ?? resolvedMedia.macosImageUrl ?? payload.displayMedia.macosImageUrl,
    android_image_url:
      cachedMedia.androidImageUrl ?? resolvedMedia.androidImageUrl ?? payload.displayMedia.androidImageUrl,
    icon_url: cachedMedia.iconUrl ?? resolvedMedia.iconUrl ?? payload.displayMedia.iconUrl,
    segment_id: payload.segmentId,
    status: resolvedStatus,
    created_at: new Date().toISOString(),
    sent_at: resolvedStatus === 'queued' ? new Date().toISOString() : null,
    scheduled_at: payload.isScheduled ? payload.scheduledAt : null,
    delivery_count: 0,
    target_recipient_count: resolvedTargetCount,
    click_count: 0,
    revenue_cents: 0,
  };

  if (payload.launchingExistingDraft) {
    patchOptimisticCampaign(queryClient, payload.shopDomain, campaignId, launchedCampaign);
  } else {
    replaceOptimisticCampaignId(queryClient, payload.shopDomain, payload.optimisticId, launchedCampaign);
  }

  clearWizardLaunchMediaCache(payload.shopDomain);
  clearPendingCampaignLaunch(payload.shopDomain);
  clearCampaignLaunchFailure(payload.shopDomain);
  void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns(payload.shopDomain) });
};

const markLaunchFailed = (
  queryClient: QueryClient,
  payload: CampaignLaunchPayload,
  message: string,
) => {
  patchOptimisticCampaign(queryClient, payload.shopDomain, payload.optimisticId, {
    status: 'draft',
  });
  clearPendingCampaignLaunch(payload.shopDomain);
  notifyCampaignLaunchFailure(payload.shopDomain, message);
};

export async function runCampaignBackgroundLaunch(
  queryClient: QueryClient,
  payload: CampaignLaunchPayload,
) {
  const flightKey = `${payload.shopDomain}:${payload.optimisticId}`;
  const existing = inFlightLaunches.get(flightKey);
  if (existing) {
    return existing;
  }

  const run = (async () => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= CAMPAIGN_LAUNCH_MAX_ATTEMPTS; attempt += 1) {
      try {
        if (attempt > 1) {
          await prefetchAppBootstrap(queryClient, payload.shopDomain);
        }

        const resolvedMedia = await prepareWizardLaunchMedia(payload.shopDomain, payload.launchMedia);
        const launchResult = await postCampaignLaunch(payload, resolvedMedia);
        await applySuccessfulLaunch(queryClient, payload, launchResult, resolvedMedia);
        return;
      } catch (error) {
        lastError = error;
        if (!isLaunchRetryableError(error) || attempt >= CAMPAIGN_LAUNCH_MAX_ATTEMPTS) {
          break;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 250 * attempt));
      }
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : 'Failed to queue campaign delivery.';

    markLaunchFailed(queryClient, payload, message);
    throw lastError instanceof Error ? lastError : new Error(message);
  })();

  inFlightLaunches.set(flightKey, run);

  try {
    await run;
  } finally {
    inFlightLaunches.delete(flightKey);
  }
}

export function resumePendingCampaignLaunches(queryClient: QueryClient, shop: string) {
  if (!shop.trim()) {
    return;
  }

  const pending = readPendingCampaignLaunch(shop);
  if (!pending) {
    return;
  }

  const campaignsPayload = queryClient.getQueryData<{ campaigns?: Array<Record<string, unknown>> }>(
    queryKeys.campaigns(shop),
  );
  const campaigns = Array.isArray(campaignsPayload?.campaigns) ? campaignsPayload.campaigns : [];
  const optimisticCampaign = campaigns.find((campaign) => String(campaign.id) === pending.optimisticId);
  const status = String(optimisticCampaign?.status ?? '').toLowerCase();

  if (optimisticCampaign && status !== 'queued' && status !== 'sending' && status !== 'scheduled') {
    clearPendingCampaignLaunch(shop);
    return;
  }

  void runCampaignBackgroundLaunch(queryClient, pending).catch(() => undefined);
}
