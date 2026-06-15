'use client';

import { runWithBackgroundRetries } from '@/lib/client/background-save';
import { queryKeys } from '@/lib/client/query-keys';
import type { QueryClient } from '@tanstack/react-query';

const deletedKey = (shop: string) => `pe:segments-deleted:${shop}`;

const readDeletedIds = (shop: string): Set<string> => {
  if (typeof window === 'undefined' || !shop) {
    return new Set();
  }

  try {
    const raw = sessionStorage.getItem(deletedKey(shop));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
};

const writeDeletedIds = (shop: string, ids: Set<string>) => {
  if (typeof window === 'undefined' || !shop) {
    return;
  }

  if (ids.size === 0) {
    sessionStorage.removeItem(deletedKey(shop));
    return;
  }

  sessionStorage.setItem(deletedKey(shop), JSON.stringify(Array.from(ids)));
};

export const markSegmentDeleted = (shop: string, segmentId: string) => {
  const ids = readDeletedIds(shop);
  ids.add(segmentId);
  writeDeletedIds(shop, ids);
};

export const clearSegmentDeleted = (shop: string, segmentId: string) => {
  const ids = readDeletedIds(shop);
  ids.delete(segmentId);
  writeDeletedIds(shop, ids);
};

export const filterDeletedSegments = <T extends { id: string }>(shop: string, segments: T[]): T[] => {
  const deleted = readDeletedIds(shop);
  if (deleted.size === 0) {
    return segments;
  }

  return segments.filter((segment) => !deleted.has(String(segment.id)));
};

export const mergeSegmentsFromCache = (
  queryClient: QueryClient,
  shop: string,
  fresh: { segments?: unknown[]; ok?: boolean },
) => {
  const previous = queryClient.getQueryData<{ segments?: unknown[] }>(queryKeys.segments(shop));
  const freshRows = Array.isArray(fresh.segments) ? fresh.segments : [];
  const previousRows = Array.isArray(previous?.segments) ? previous.segments : [];

  const byId = new Map<string, unknown>();
  for (const row of previousRows) {
    if (row && typeof row === 'object' && 'id' in row) {
      byId.set(String((row as { id: unknown }).id), row);
    }
  }
  for (const row of freshRows) {
    if (row && typeof row === 'object' && 'id' in row) {
      byId.set(String((row as { id: unknown }).id), row);
    }
  }

  const merged = filterDeletedSegments(
    shop,
    Array.from(byId.values()).map((row) => row as { id: string }),
  );

  return {
    ok: true,
    segments: merged,
  };
};

export const deleteSegmentInBackground = async (shop: string, segmentId: string) => {
  await runWithBackgroundRetries(async () => {
    const response = await fetch(
      `/api/segments/${encodeURIComponent(segmentId)}?shop=${encodeURIComponent(shop)}`,
      { method: 'DELETE' },
    );
    const json = (await response.json().catch(() => ({ ok: false }))) as {
      ok?: boolean;
      error?: string;
    };
    if (!response.ok || !json.ok) {
      throw new Error(json.error ?? 'Failed to delete segment.');
    }
  });
};
