'use client';

import { pickCampaignBarImageUrl } from '@/lib/client/campaign-bar-image';
import { queryKeys } from '@/lib/client/query-keys';
import type { QueryClient } from '@tanstack/react-query';

export type OptimisticCampaign = {
  id: string;
  title: string;
  body?: string;
  image_url?: string | null;
  icon_url?: string | null;
  segment_id?: string | null;
  status: string;
  created_at: string;
  sent_at?: string | null;
  scheduled_at?: string | null;
  delivery_count?: number;
  click_count?: number;
  revenue_cents?: number;
  windows_image_url?: string | null;
  macos_image_url?: string | null;
  android_image_url?: string | null;
};

const pinnedCampaignsKey = (shop: string) => `pe:pinned-campaigns:${shop}`;

const readPinnedCampaignIds = (shop: string): string[] => {
  if (typeof window === 'undefined' || !shop) {
    return [];
  }

  try {
    const raw = sessionStorage.getItem(pinnedCampaignsKey(shop));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

const writePinnedCampaignIds = (shop: string, ids: string[]) => {
  if (typeof window === 'undefined' || !shop) {
    return;
  }

  try {
    sessionStorage.setItem(pinnedCampaignsKey(shop), JSON.stringify(ids.slice(0, 50)));
  } catch {
    // Ignore storage quota errors.
  }
};

const pinCampaignId = (shop: string, campaignId: string) => {
  const next = [campaignId, ...readPinnedCampaignIds(shop).filter((id) => id !== campaignId)];
  writePinnedCampaignIds(shop, next);
};

const normalizeCampaignRecord = (campaign: Record<string, unknown>) => {
  const listImage = pickCampaignBarImageUrl({
    imageUrl: (campaign.image_url ?? campaign.imageUrl) as string | null | undefined,
    windowsImageUrl: (campaign.windows_image_url ?? campaign.windowsImageUrl) as string | null | undefined,
    macosImageUrl: (campaign.macos_image_url ?? campaign.macosImageUrl) as string | null | undefined,
    androidImageUrl: (campaign.android_image_url ?? campaign.androidImageUrl) as string | null | undefined,
  });

  return {
    ...campaign,
    image_url: listImage ?? campaign.image_url ?? campaign.imageUrl ?? null,
    windows_image_url: campaign.windows_image_url ?? campaign.windowsImageUrl ?? null,
    macos_image_url: campaign.macos_image_url ?? campaign.macosImageUrl ?? null,
    android_image_url: campaign.android_image_url ?? campaign.androidImageUrl ?? null,
  };
};

export const mergeCampaignListPayload = (
  previous: { ok?: boolean; campaigns?: unknown[] } | undefined,
  fresh: { ok?: boolean; campaigns?: unknown[] },
  pinnedIds: string[] = [],
) => {
  const freshList = Array.isArray(fresh.campaigns)
    ? fresh.campaigns.map((item) => normalizeCampaignRecord(item as Record<string, unknown>))
    : [];
  const previousList = Array.isArray(previous?.campaigns)
    ? previous.campaigns.map((item) => normalizeCampaignRecord(item as Record<string, unknown>))
    : [];

  const byId = new Map<string, Record<string, unknown>>();

  for (const campaign of previousList) {
    byId.set(String(campaign.id), campaign);
  }

  for (const campaign of freshList) {
    const id = String(campaign.id);
    const existing = byId.get(id);
    byId.set(
      id,
      existing
        ? normalizeCampaignRecord({
            ...existing,
            ...campaign,
            image_url:
              campaign.image_url ??
              existing.image_url ??
              existing.macos_image_url ??
              existing.windows_image_url ??
              existing.android_image_url,
          })
        : campaign,
    );
  }

  const merged = Array.from(byId.values()).sort((left, right) => {
    const leftPinned = pinnedIds.includes(String(left.id)) ? 1 : 0;
    const rightPinned = pinnedIds.includes(String(right.id)) ? 1 : 0;
    if (leftPinned !== rightPinned) {
      return rightPinned - leftPinned;
    }

    const leftTime = Date.parse(String(left.created_at ?? left.sent_at ?? 0));
    const rightTime = Date.parse(String(right.created_at ?? right.sent_at ?? 0));
    return rightTime - leftTime;
  });

  return {
    ok: true,
    campaigns: merged,
  };
};

export const prependOptimisticCampaign = (
  queryClient: QueryClient,
  shop: string,
  campaign: OptimisticCampaign,
) => {
  pinCampaignId(shop, campaign.id);

  const normalized = normalizeCampaignRecord(campaign as unknown as Record<string, unknown>);

  queryClient.setQueryData(queryKeys.campaigns(shop), (current: { ok?: boolean; campaigns?: unknown[] } | undefined) => {
    const pinnedIds = readPinnedCampaignIds(shop);
    return mergeCampaignListPayload(current, {
      ok: true,
      campaigns: [normalized, ...Array.isArray(current?.campaigns) ? current.campaigns : []],
    }, pinnedIds);
  });
};

export const bumpDashboardCampaignSent = (queryClient: QueryClient, shop: string) => {
  queryClient.setQueryData(queryKeys.dashboardSummary(shop), (current: Record<string, unknown> | undefined) => {
    const campaignStatsRaw = (current?.campaignStats ?? {}) as Record<string, unknown>;
    const campaignStats = (campaignStatsRaw.stats ?? campaignStatsRaw) as Record<string, unknown>;
    const overview = (current?.overview ?? {}) as Record<string, unknown>;

    const nextSent = Number(campaignStats.sentCount ?? campaignStats.sent ?? overview.campaignCount ?? 0) + 1;

    return {
      ...(current ?? {}),
      overview: {
        ...overview,
        campaignCount: nextSent,
      },
      campaignStats: {
        ...campaignStatsRaw,
        sentCount: nextSent,
        sent: nextSent,
        stats: {
          ...campaignStats,
          sentCount: nextSent,
          sent: nextSent,
        },
      },
    };
  });
};

export const buildAudienceSegmentsFromCache = (
  queryClient: QueryClient,
  shop: string,
): Array<{ id: string; name: string; count: number }> => {
  const segmentsPayload = queryClient.getQueryData<{ segments?: Array<Record<string, unknown>> }>(
    queryKeys.segments(shop),
  );
  const overviewPayload = queryClient.getQueryData<Record<string, unknown>>(
    queryKeys.subscribersOverview(shop),
  );
  const bootstrapPayload = queryClient.getQueryData<{ subscriberKpis?: Record<string, unknown> }>(
    queryKeys.dashboardSummary(shop),
  );

  const allCount = Number(
    overviewPayload?.totalSubscribers
      ?? bootstrapPayload?.subscriberKpis?.totalSubscribers
      ?? 0,
  );

  const dynamicSegments = Array.isArray(segmentsPayload?.segments)
    ? segmentsPayload.segments.map((segment) => ({
        id: String(segment.id),
        name: String(segment.name ?? 'Segment'),
        count: Number(segment.subscriberCount ?? segment.estimated_subscriber_count ?? 0),
      }))
    : [];

  return [{ id: 'all', name: 'All Subscribers', count: allCount }, ...dynamicSegments];
};

export const getPinnedCampaignIds = readPinnedCampaignIds;

export const mergeCampaignsFromCache = (
  queryClient: QueryClient,
  shop: string,
  fresh: { ok?: boolean; campaigns?: unknown[] },
) => {
  const previous = queryClient.getQueryData<{ ok?: boolean; campaigns?: unknown[] }>(queryKeys.campaigns(shop));
  return mergeCampaignListPayload(previous, fresh, readPinnedCampaignIds(shop));
};
