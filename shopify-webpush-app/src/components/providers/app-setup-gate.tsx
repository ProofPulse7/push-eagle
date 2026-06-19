'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { hasWarmShopCache } from '@/lib/client/app-cache-ready';
import { AppSetupScreen } from '@/components/ui/loading-ui';
import { usePersistRestored } from '@/components/providers/query-provider';
import { useAppBootstrap } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { queryKeys } from '@/lib/client/query-keys';

const SETUP_STEPS = [
  'Connecting to your store…',
  'Loading saved settings…',
  'Preparing campaigns and stats…',
  'Almost ready…',
] as const;

const shouldSkipSetup = (pathname: string) => {
  if (pathname === '/' || pathname.startsWith('/privacy') || pathname.startsWith('/terms')) {
    return true;
  }
  if (pathname.startsWith('/login')) {
    return true;
  }
  if (
    pathname.startsWith('/campaigns/new/editor') ||
    pathname.startsWith('/campaigns/new/schedule')
  ) {
    return true;
  }
  return /^\/automations\/[a-zA-Z0-9-]+\/[^/]+\/edit$/.test(pathname);
};

/**
 * Shows a full loading screen on cold start, then reveals the app with cached data.
 * Returning users with a warm sessionStorage cache skip the overlay entirely.
 */
export function AppSetupGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const isRestored = usePersistRestored();
  const bootstrap = useAppBootstrap();
  const skip = shouldSkipSetup(pathname);

  const hasWarmCache = Boolean(shop && hasWarmShopCache(queryClient, shop));
  const cachedBootstrap = shop ? queryClient.getQueryData(queryKeys.bootstrap(shop)) : undefined;
  const canRenderApp = skip || !shop || isRestored;
  const hasBootstrapData = Boolean(bootstrap.data ?? cachedBootstrap);
  const needsBootstrap = Boolean(shop) && !hasWarmCache && !hasBootstrapData;
  const showBootstrapOverlay =
    canRenderApp && !skip && Boolean(shop) && needsBootstrap && bootstrap.isPending && !bootstrap.isError;

  const [progress, setProgress] = useState(hasWarmCache ? 100 : 24);
  const [overlayVisible, setOverlayVisible] = useState(showBootstrapOverlay);

  useEffect(() => {
    setOverlayVisible(showBootstrapOverlay);
    if (hasWarmCache) {
      setProgress(100);
    }
  }, [showBootstrapOverlay, hasWarmCache]);

  useEffect(() => {
    if (!showBootstrapOverlay) {
      return;
    }

    const start = performance.now();
    const tick = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const target = bootstrap.isSuccess ? 100 : Math.min(94, 24 + elapsed / 18);
      setProgress((current) => Math.max(current, target));
      if (bootstrap.isSuccess && elapsed > 120) {
        setProgress(100);
        window.setTimeout(() => setOverlayVisible(false), 80);
      }
    }, 40);

    return () => window.clearInterval(tick);
  }, [showBootstrapOverlay, bootstrap.isSuccess]);

  const stepIndex = Math.min(
    SETUP_STEPS.length - 1,
    Math.floor((progress / 100) * SETUP_STEPS.length),
  );

  if (!canRenderApp) {
    return <AppSetupScreen progress={18} stepLabel="Restoring your workspace…" />;
  }

  return (
    <>
      {overlayVisible ? (
        <AppSetupScreen
          progress={progress}
          stepLabel={SETUP_STEPS[stepIndex]}
          error={
            bootstrap.isError
              ? bootstrap.error instanceof Error
                ? bootstrap.error.message
                : 'Setup failed. Please try again.'
              : null
          }
          onRetry={
            bootstrap.isError
              ? () => {
                  void bootstrap.refetch();
                }
              : undefined
          }
        />
      ) : null}
      {children}
    </>
  );
}
