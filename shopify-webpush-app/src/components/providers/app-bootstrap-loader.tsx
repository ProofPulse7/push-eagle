'use client';

import { useEffect } from 'react';

import { useAppBootstrap } from '@/hooks/queries/use-app-queries';
import { BackgroundRoutePrefetcher } from '@/components/providers/background-route-prefetcher';

/**
 * Warms the React Query cache on app load (sessionStorage-backed).
 * Does not block rendering — pages read cached data immediately when available.
 */
export function AppBootstrapLoader({ children }: { children: React.ReactNode }) {
  const bootstrap = useAppBootstrap();

  useEffect(() => {
    if (bootstrap.isError) {
      console.warn('[Push Eagle] Background bootstrap refresh failed:', bootstrap.error);
    }
  }, [bootstrap.error, bootstrap.isError]);

  return (
    <>
      <BackgroundRoutePrefetcher />
      {children}
    </>
  );
}
