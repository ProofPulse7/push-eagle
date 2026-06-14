'use client';

import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/client/query-keys';

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
};

export const prependOptimisticCampaign = (
  queryClient: QueryClient,
  shop: string,
  campaign: OptimisticCampaign,
) => {
  queryClient.setQueryData(queryKeys.campaigns(shop), (current: { ok?: boolean; campaigns?: unknown[] } | undefined) => {
    const existing = Array.isArray(current?.campaigns) ? current.campaigns : [];
    return {
      ok: true,
      campaigns: [campaign, ...existing.filter((item) => String((item as { id?: string }).id) !== campaign.id)],
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
