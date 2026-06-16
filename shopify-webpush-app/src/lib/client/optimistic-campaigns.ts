'use client';

import { broadcastShopSync } from '@/lib/client/shop-sync-bus';
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

type LaunchBridge = {
  optimisticId: string;
  realId?: string;
  title?: string;
  supersededIds: string[];
};

const pinnedCampaignIdsKey = (shop: string) => `pe:pinned-campaign-ids:${shop}`;
const pinnedCampaignSnapshotsKey = (shop: string) => `pe:pinned-campaign-snapshots:${shop}`;
const launchBridgeKey = (shop: string) => `pe:launch-bridge:${shop}`;

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

const readLaunchBridge = (shop: string): LaunchBridge | null => {
  if (typeof window === 'undefined' || !shop) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(launchBridgeKey(shop));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as LaunchBridge;
    if (!parsed?.optimisticId) {
      return null;
    }
    return {
      optimisticId: String(parsed.optimisticId),
      realId: parsed.realId ? String(parsed.realId) : undefined,
      title: parsed.title ? String(parsed.title) : undefined,
      supersededIds: Array.isArray(parsed.supersededIds) ? parsed.supersededIds.map(String) : [],
    };
  } catch {
    return null;
  }
};

const writeLaunchBridge = (shop: string, bridge: LaunchBridge | null) => {
  if (typeof window === 'undefined' || !shop) {
    return;
  }

  try {
    if (!bridge) {
      sessionStorage.removeItem(launchBridgeKey(shop));
      return;
    }
    sessionStorage.setItem(launchBridgeKey(shop), JSON.stringify(bridge));
  } catch {
    // Ignore storage quota errors.
  }
};

const readSupersededIds = (shop: string): Set<string> => {
  const bridge = readLaunchBridge(shop);
  return new Set(bridge?.supersededIds ?? []);
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

const preferImageUrl = (next: unknown, previous: unknown): string | null => {
  const nextValue = String(next ?? '').trim();
  const previousValue = String(previous ?? '').trim();

  if (nextValue && !nextValue.startsWith('blob:') && !nextValue.startsWith('data:')) {
    return nextValue;
  }

  if (previousValue) {
    return previousValue;
  }

  return nextValue || null;
};

const mergeCampaignImages = (
  incoming: Record<string, unknown>,
  existing?: Record<string, unknown>,
) => {
  const merged = {
    ...existing,
    ...incoming,
    windows_image_url: preferImageUrl(incoming.windows_image_url ?? incoming.windowsImageUrl, existing?.windows_image_url ?? existing?.windowsImageUrl),
    macos_image_url: preferImageUrl(incoming.macos_image_url ?? incoming.macosImageUrl, existing?.macos_image_url ?? existing?.macosImageUrl),
    android_image_url: preferImageUrl(incoming.android_image_url ?? incoming.androidImageUrl, existing?.android_image_url ?? existing?.androidImageUrl),
    icon_url: preferImageUrl(incoming.icon_url ?? incoming.iconUrl, existing?.icon_url ?? existing?.iconUrl),
  };

  const listImage = pickCampaignBarImageUrl({
    imageUrl: (merged.image_url ?? merged.imageUrl ?? incoming.image_url ?? incoming.imageUrl) as string | null,
    windowsImageUrl: merged.windows_image_url as string | null,
    macosImageUrl: merged.macos_image_url as string | null,
    androidImageUrl: merged.android_image_url as string | null,
  });

  merged.image_url = preferImageUrl(listImage ?? incoming.image_url ?? incoming.imageUrl, existing?.image_url ?? existing?.imageUrl);

  return merged;
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

const sortCampaigns = (campaigns: Record<string, unknown>[], pinnedIds: string[]) =>
  campaigns.sort((left, right) => {
    const leftPinned = pinnedIds.includes(String(left.id)) ? 1 : 0;
    const rightPinned = pinnedIds.includes(String(right.id)) ? 1 : 0;
    if (leftPinned !== rightPinned) {
      return rightPinned - leftPinned;
    }

    const leftTime = Date.parse(String(left.created_at ?? left.sent_at ?? 0));
    const rightTime = Date.parse(String(right.created_at ?? right.sent_at ?? 0));
    return rightTime - leftTime;
  });

const linkPendingLaunchFromServer = (
  shop: string,
  previousList: Record<string, unknown>[],
  freshList: Record<string, unknown>[],
) => {
  const bridge = readLaunchBridge(shop);
  if (!bridge || bridge.realId) {
    return freshList;
  }

  const previousIds = new Set(previousList.map((campaign) => String(campaign.id)));
  const newFromServer = freshList.filter((campaign) => !previousIds.has(String(campaign.id)));
  if (newFromServer.length !== 1) {
    return freshList;
  }

  const serverCampaign = newFromServer[0];
  const snapshots = readPinnedSnapshots(shop);
  const optimisticSnapshot = snapshots[bridge.optimisticId];
  const sameTitle =
    bridge.title && String(serverCampaign.title ?? '') === bridge.title;

  if (!optimisticSnapshot && !sameTitle) {
    return freshList;
  }

  const superseded = new Set(bridge.supersededIds);
  superseded.add(bridge.optimisticId);

  writeLaunchBridge(shop, {
    ...bridge,
    realId: String(serverCampaign.id),
    supersededIds: Array.from(superseded),
  });

  removePinnedCampaign(shop, bridge.optimisticId);

  const linked = freshList.map((campaign) => {
    if (String(campaign.id) !== String(serverCampaign.id)) {
      return campaign;
    }

    return normalizeCampaignRecord(
      mergeCampaignImages(campaign, optimisticSnapshot),
    );
  });

  const linkedRecord = linked.find((campaign) => String(campaign.id) === String(serverCampaign.id));
  if (linkedRecord) {
    pinCampaignId(shop, String(linkedRecord.id));
    savePinnedSnapshot(shop, linkedRecord);
  }

  return linked;
};

export const mergeCampaignListPayload = (
  previous: { ok?: boolean; campaigns?: unknown[] } | undefined,
  fresh: { ok?: boolean; campaigns?: unknown[] },
  shop: string,
) => {
  const supersededIds = readSupersededIds(shop);
  const pinnedIds = readPinnedCampaignIds(shop);
  const snapshots = readPinnedSnapshots(shop);

  let freshList = Array.isArray(fresh.campaigns)
    ? fresh.campaigns.map((item) => normalizeCampaignRecord(item as Record<string, unknown>))
    : [];
  const previousList = Array.isArray(previous?.campaigns)
    ? previous.campaigns
        .map((item) => normalizeCampaignRecord(item as Record<string, unknown>))
        .filter((campaign) => !supersededIds.has(String(campaign.id)))
    : [];

  freshList = linkPendingLaunchFromServer(shop, previousList, freshList);

  for (const campaign of freshList) {
    const id = String(campaign.id);
    if (pinnedIds.includes(id)) {
      removePinnedCampaign(shop, id);
    }
  }

  const byId = new Map<string, Record<string, unknown>>();

  for (const campaign of previousList) {
    const id = String(campaign.id);
    if (supersededIds.has(id)) {
      continue;
    }
    byId.set(id, campaign);
  }

  for (const campaign of freshList) {
    const id = String(campaign.id);
    const existing = byId.get(id);
    const snapshot = snapshots[id];
    byId.set(
      id,
      normalizeCampaignRecord(
        mergeCampaignImages(campaign, mergeCampaignImages(existing ?? {}, snapshot ?? {})),
      ),
    );
  }

  const activePinnedIds = readPinnedCampaignIds(shop);
  for (const pinnedId of activePinnedIds) {
    if (supersededIds.has(pinnedId) || byId.has(pinnedId)) {
      continue;
    }

    const snapshot = snapshots[pinnedId];
    if (snapshot) {
      byId.set(pinnedId, normalizeCampaignRecord(snapshot));
    }
  }

  const bridge = readLaunchBridge(shop);
  if (bridge?.realId && byId.has(bridge.realId) && byId.has(bridge.optimisticId)) {
    byId.delete(bridge.optimisticId);
  }

  if (bridge?.realId) {
    for (const id of supersededIds) {
      byId.delete(id);
    }
  }

  const merged = sortCampaigns(Array.from(byId.values()), activePinnedIds);

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
  writeLaunchBridge(shop, {
    optimisticId: campaign.id,
    title: campaign.title,
    supersededIds: [],
  });

  pinCampaignId(shop, campaign.id);

  const normalized = normalizeCampaignRecord(campaign as unknown as Record<string, unknown>);
  savePinnedSnapshot(shop, normalized);

  queryClient.setQueryData(queryKeys.campaigns(shop), (current: { ok?: boolean; campaigns?: unknown[] } | undefined) => {
    const currentList = Array.isArray(current?.campaigns)
      ? current.campaigns
          .map((item) => normalizeCampaignRecord(item as Record<string, unknown>))
          .filter((item) => String(item.id) !== campaign.id)
      : [];

    return {
      ok: true,
      campaigns: sortCampaigns([normalized, ...currentList], readPinnedCampaignIds(shop)),
    };
  });
};

export const replaceOptimisticCampaignId = (
  queryClient: QueryClient,
  shop: string,
  optimisticId: string,
  campaign: OptimisticCampaign,
) => {
  const bridge = readLaunchBridge(shop);
  const superseded = new Set(bridge?.supersededIds ?? []);
  superseded.add(optimisticId);

  writeLaunchBridge(shop, {
    optimisticId,
    realId: campaign.id,
    title: campaign.title,
    supersededIds: Array.from(superseded),
  });

  removePinnedCampaign(shop, optimisticId);
  pinCampaignId(shop, campaign.id);

  const normalized = normalizeCampaignRecord(campaign as unknown as Record<string, unknown>);
  savePinnedSnapshot(shop, normalized);

  queryClient.setQueryData(queryKeys.campaigns(shop), (current: { ok?: boolean; campaigns?: unknown[] } | undefined) => {
    const currentList = Array.isArray(current?.campaigns)
      ? current.campaigns.map((item) => normalizeCampaignRecord(item as Record<string, unknown>))
      : [];

    const filtered = currentList.filter((item) => {
      const id = String(item.id);
      return id !== optimisticId && id !== campaign.id && !superseded.has(id);
    });

    return {
      ok: true,
      campaigns: sortCampaigns([normalized, ...filtered], readPinnedCampaignIds(shop)),
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
