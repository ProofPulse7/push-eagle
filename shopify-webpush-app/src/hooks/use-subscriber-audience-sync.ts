'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { buildAudienceSegmentsFromCache } from '@/lib/client/optimistic-campaigns';
import { subscribeShopSync } from '@/lib/client/shop-sync-bus';
import { useShopDomain } from '@/hooks/use-shop-domain';

type AudienceSegment = {
  id: string;
  name: string;
  count: number;
};

/** Keeps campaign audience segment counts in sync when subscriber totals change app-wide. */
export const useSubscriberAudienceSync = (
  setSegments: (segments: AudienceSegment[]) => void,
  segmentId: string,
  setSegmentId: (id: string) => void,
) => {
  const shop = useShopDomain();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!shop) {
      return;
    }

    const refreshFromCache = () => {
      const cached = buildAudienceSegmentsFromCache(queryClient, shop);
      if (cached.length === 0) {
        return;
      }

      setSegments(cached);
      if (!cached.some((item) => item.id === segmentId)) {
        setSegmentId(cached[0].id);
      }
    };

    const unsubscribe = subscribeShopSync(shop, (event) => {
      if (event.type === 'subscribers' || event.type === 'all') {
        refreshFromCache();
      }
    });

    return unsubscribe;
  }, [queryClient, segmentId, setSegmentId, setSegments, shop]);
};
