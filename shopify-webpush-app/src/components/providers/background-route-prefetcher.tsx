'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { prefetchAppPages } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';

const ROUTES = [
  '/dashboard',
  '/campaigns',
  '/subscribers',
  '/automations',
  '/segments',
  '/plans',
  '/settings',
  '/campaigns/new/details',
  '/campaigns/new/editor',
] as const;

/**
 * After the current page is interactive, prefetch adjacent routes and API data in the background.
 */
export function BackgroundRoutePrefetcher() {
  const shop = useShopDomain();
  const router = useRouter();
  const queryClient = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (!shop || started.current) {
      return;
    }

    started.current = true;

    const startTimer = window.setTimeout(() => {
      void prefetchAppPages(queryClient, shop);

      let index = 0;
      const scheduleNext = () => {
        if (index >= ROUTES.length) {
          return;
        }

        router.prefetch(ROUTES[index]);
        index += 1;
        window.setTimeout(scheduleNext, 100);
      };

      scheduleNext();
    }, 350);

    return () => window.clearTimeout(startTimer);
  }, [queryClient, router, shop]);

  return null;
}
