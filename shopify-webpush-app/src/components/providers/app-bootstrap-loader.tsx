'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAppBootstrap } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';

/**
 * Warms the React Query cache on app load (sessionStorage-backed).
 * Does not block rendering — pages read cached data immediately when available.
 */
export function AppBootstrapLoader({ children }: { children: React.ReactNode }) {
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const bootstrap = useAppBootstrap();

  useEffect(() => {
    if (!shop) {
      return;
    }

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['pe', shop] });
    };

    const interval = window.setInterval(refresh, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [queryClient, shop]);

  useEffect(() => {
    if (bootstrap.isError) {
      console.warn('[Push Eagle] Background bootstrap refresh failed:', bootstrap.error);
    }
  }, [bootstrap.error, bootstrap.isError]);

  return <>{children}</>;
}
