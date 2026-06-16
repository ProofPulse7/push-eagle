'use client';

import { broadcastShopSync } from '@/lib/client/shop-sync-bus';
import {
  applyLaunchMediaToCampaign,
  migrateLaunchMedia,
  readOptimisticReplacements,
  registerOptimisticReplacement,
} from '@/lib/client/campaign-launch-media-cache';
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

const pinnedCampaignIdsKey = (shop: string) => `pe:pinned-campaign-ids:${shop}`;
const pinnedCampaignSnapshotsKey = (shop: string) => `pe:pinned-campaign-snapshots:${shop}`;

const readPinnedCampaignIds = (shop: string): string[] => {
  if (typeof window === 'undefined' || !shop) {
    return [];
  }

  try {
    const raw = sessionStorage.getItem(pinnedCampaignIdsKey(shop));
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
    sessionStorage.setItem(pinnedCampaignIdsKey(shop), JSON.stringify(ids.slice(0, 50)));
  } catch {
    // Ignore storage quota errors.
  }
};

const readPinnedSnapshots = (shop: string): Record<string, Record<string, unknown>> => {
  if (typeof window === 'undefined' || !shop) {
    return {};
  }

  try {
    const raw = sessionStorage.getItem(pinnedCampaignSnapshotsKey(shop));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, Record<string, unknown>>) : {};
  } catch {
    return {};
  }
};

const writePinnedSnapshots = (shop: string, snapshots: Record<string, Record<string, unknown>>) => {
  if (typeof window === 'undefined' || !shop) {
    return;
  }

  try {
    const entries = Object.entries(snapshots).slice(0, 50);
    sessionStorage.setItem(pinnedCampaignSnapshotsKey(shop), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Ignore storage quota errors.
  }
};

const pinCampaignId = (shop: string, campaignId: string) => {
  const next = [campaignId, ...readPinnedCampaignIds(shop).filter((id) => id !== campaignId)];
  writePinnedCampaignIds(shop, next);
};

const savePinnedSnapshot = (shop: string, campaign: Record<string, unknown>) => {
  const id = String(campaign.id ?? '');
  if (!id) {
    return;
  }

  const snapshots = readPinnedSnapshots(shop);
  snapshots[id] = campaign;
  writePinnedSnapshots(shop, snapshots);
};

const removePinnedCampaign = (shop: string, campaignId: string) => {
  writePinnedCampaignIds(
    shop,
    readPinnedCampaignIds(shop).filter((id) => id !== campaignId),
  );

  const snapshots = readPinnedSnapshots(shop);
  if (snapshots[campaignId]) {
    delete snapshots[campaignId];
    writePinnedSnapshots(shop, snapshots);
  }
};

const normalizeCampaignRecord = (shop: string, campaign: Record<string, unknown>) => {
  const withMedia = applyLaunchMediaToCampaign(shop, campaign);
  const listImage = pickCampaignBarImageUrl({
    imageUrl: (withMedia.image_url ?? withMedia.imageUrl) as string | null | undefined,
    windowsImageUrl: (withMedia.windows_image_url ?? withMedia.windowsImageUrl) as string | null | undefined,
    macosImageUrl: (withMedia.macos_image_url ?? withMedia.macosImageUrl) as string | null | undefined,
    androidImageUrl: (withMedia.android_image_url ?? withMedia.androidImageUrl) as string | null | undefined,
  });

  return {
    ...withMedia,
    image_url: listImage ?? withMedia.image_url ?? withMedia.imageUrl ?? null,
    windows_image_url: withMedia.windows_image_url ?? withMedia.windowsImageUrl ?? null,
    macos_image_url: withMedia.macos_image_url ?? withMedia.macosImageUrl ?? null,
    android_image_url: withMedia.android_image_url ?? withMedia.androidImageUrl ?? null,
  };
};

export const mergeCampaignListPayload = (
  previous: { ok?: boolean; campaigns?: unknown[] } | undefined,
  fresh: { ok?: boolean; campaigns?: unknown[] },
  shop: string,
) => {
  const pinnedIds = readPinnedCampaignIds(shop);
  const snapshots = readPinnedSnapshots(shop);

  const freshList = Array.isArray(fresh.campaigns)
    ? fresh.campaigns.map((item) => normalizeCampaignRecord(shop, item as Record<string, unknown>))
    : [];
  const previousList = Array.isArray(previous?.campaigns)
    ? previous.campaigns.map((item) => normalizeCampaignRecord(shop, item as Record<string, unknown>))
    : [];

  const freshIds = new Set(freshList.map((campaign) => String(campaign.id)));
  const replacements = readOptimisticReplacements(shop);
  const supersededOptimisticIds = new Set(
    Object.entries(replacements)
      .filter(([, realId]) => freshIds.has(String(realId)))
      .map(([optimisticId]) => optimisticId),
  );

  for (const campaign of freshList) {
    const id = String(campaign.id);
    if (pinnedIds.includes(id)) {
      removePinnedCampaign(shop, id);
    }
  }

  const byId = new Map<string, Record<string, unknown>>();

  for (const campaign of previousList) {
    const id = String(campaign.id);
    if (supersededOptimisticIds.has(id)) {
      continue;
    }
    byId.set(id, campaign);
  }

  for (const campaign of freshList) {
    const id = String(campaign.id);
    const existing = byId.get(id);
    byId.set(
      id,
      existing
        ? normalizeCampaignRecord(shop, {
            ...existing,
            ...campaign,
            image_url:
              campaign.image_url ??
              existing.image_url ??
              existing.macos_image_url ??
              existing.windows_image_url ??
              existing.android_image_url,
            windows_image_url: campaign.windows_image_url ?? existing.windows_image_url,
            macos_image_url: campaign.macos_image_url ?? existing.macos_image_url,
            android_image_url: campaign.android_image_url ?? existing.android_image_url,
          })
        : campaign,
    );
  }

  for (const optimisticId of supersededOptimisticIds) {
    byId.delete(optimisticId);
  }

  for (const [optimisticId, realId] of Object.entries(replacements)) {
    if (byId.has(String(realId))) {
      byId.delete(optimisticId);
    }
  }

  const previousIds = new Set(previousList.map((campaign) => String(campaign.id)));
  const newFromServer = freshList.filter((campaign) => !previousIds.has(String(campaign.id)));
  const pinnedOnlyInCache = pinnedIds.filter((id) => !freshIds.has(id));

  if (pinnedOnlyInCache.length === 1 && newFromServer.length === 1) {
    const optimisticId = pinnedOnlyInCache[0];
    const realCampaign = newFromServer[0];
    const realId = String(realCampaign.id);
    const optimisticCampaign = byId.get(optimisticId);

    registerOptimisticReplacement(shop, optimisticId, realId);
    migrateLaunchMedia(shop, optimisticId, realId);
    removePinnedCampaign(shop, optimisticId);
    pinCampaignId(shop, realId);

    byId.delete(optimisticId);
    byId.set(
      realId,
      normalizeCampaignRecord(shop, {
        ...(optimisticCampaign ?? {}),
        ...realCampaign,
        image_url:
          realCampaign.image_url ??
          optimisticCampaign?.image_url ??
          optimisticCampaign?.macos_image_url ??
          optimisticCampaign?.windows_image_url ??
          optimisticCampaign?.android_image_url,
        windows_image_url: realCampaign.windows_image_url ?? optimisticCampaign?.windows_image_url,
        macos_image_url: realCampaign.macos_image_url ?? optimisticCampaign?.macos_image_url,
        android_image_url: realCampaign.android_image_url ?? optimisticCampaign?.android_image_url,
      }),
    );
  }

  const activePinnedIds = readPinnedCampaignIds(shop);
  for (const pinnedId of activePinnedIds) {
    if (byId.has(pinnedId)) {
      continue;
    }

    const snapshot = snapshots[pinnedId];
    if (snapshot) {
      byId.set(pinnedId, normalizeCampaignRecord(shop, snapshot));
    }
  }

  const merged = Array.from(byId.values()).sort((left, right) => {
    const leftPinned = activePinnedIds.includes(String(left.id)) ? 1 : 0;
    const rightPinned = activePinnedIds.includes(String(right.id)) ? 1 : 0;
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

  const normalized = normalizeCampaignRecord(shop, campaign as unknown as Record<string, unknown>);
  savePinnedSnapshot(shop, normalized);

  queryClient.setQueryData(queryKeys.campaigns(shop), (current: { ok?: boolean; campaigns?: unknown[] } | undefined) => {
    const currentList = Array.isArray(current?.campaigns)
      ? current.campaigns.map((item) => normalizeCampaignRecord(shop, item as Record<string, unknown>))
      : [];

    const withoutDuplicate = currentList.filter((item) => String(item.id) !== campaign.id);
    return {
      ok: true,
      campaigns: [normalized, ...withoutDuplicate],
    };
  });

  broadcastShopSync(shop, { type: 'campaigns' });
};

export const replaceOptimisticCampaignId = (
  queryClient: QueryClient,
  shop: string,
  optimisticId: string,
  campaign: OptimisticCampaign,
) => {
  removePinnedCampaign(shop, optimisticId);
  registerOptimisticReplacement(shop, optimisticId, campaign.id);
  migrateLaunchMedia(shop, optimisticId, campaign.id);
  pinCampaignId(shop, campaign.id);

  const normalized = normalizeCampaignRecord(shop, campaign as unknown as Record<string, unknown>);
  savePinnedSnapshot(shop, normalized);

  queryClient.setQueryData(queryKeys.campaigns(shop), (current: { ok?: boolean; campaigns?: unknown[] } | undefined) => {
    const currentList = Array.isArray(current?.campaigns)
      ? current.campaigns.map((item) => normalizeCampaignRecord(shop, item as Record<string, unknown>))
      : [];

    const withoutOptimistic = currentList.filter((item) => String(item.id) !== optimisticId);
    const existingIndex = withoutOptimistic.findIndex((item) => String(item.id) === campaign.id);

    let nextList: Record<string, unknown>[];
    if (existingIndex >= 0) {
      nextList = withoutOptimistic.map((item, index) =>
        index === existingIndex
          ? normalizeCampaignRecord(shop, { ...item, ...normalized })
          : item,
      );
    } else {
      nextList = [normalized, ...withoutOptimistic];
    }

    return {
      ok: true,
      campaigns: nextList.sort((left, right) => {
        const leftTime = Date.parse(String(left.created_at ?? left.sent_at ?? 0));
        const rightTime = Date.parse(String(right.created_at ?? right.sent_at ?? 0));
        return rightTime - leftTime;
      }),
    };
  });

  broadcastShopSync(shop, { type: 'campaigns' });
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
    overviewPayload?.activeSubscribers
      ?? overviewPayload?.totalSubscribers
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
  return mergeCampaignListPayload(previous, fresh, shop);
};
