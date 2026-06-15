'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { hasWarmShopCache } from '@/lib/client/app-cache-ready';
import { AppSetupScreen } from '@/components/ui/loading-ui';
import { usePersistRestored } from '@/components/providers/query-provider';
import { useAppBootstrap } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';

const SETUP_STEPS = [
  'Preparing your workspace…',
  'Loading saved settings…',
  'Almost ready…',
] as const;

const shouldSkipSetup = (pathname: string) => {
  if (pathname.startsWith('/login')) {
    return true;
  }
  if (pathname.startsWith('/campaigns/new')) {
    return true;
  }
  return /^\/automations\/[a-zA-Z0-9-]+\/[^/]+\/edit$/.test(pathname);
};

/**
 * Blocks on cold start until persisted cache is restored and bootstrap data is ready.
 * Returning users with sessionStorage cache skip almost instantly.
 */
export function AppSetupGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const isRestored = usePersistRestored();
  const bootstrap = useAppBootstrap();
  const skip = shouldSkipSetup(pathname);

  const hasWarmSessionCache = Boolean(shop && hasWarmShopCache(queryClient, shop));
  const hasBootstrapData = Boolean(bootstrap.data) || hasWarmSessionCache;

  const isReady =
    skip || !shop || (isRestored && (bootstrap.isSuccess || hasWarmSessionCache));
  const showSetup = !skip && Boolean(shop) && !isReady;

  const [progress, setProgress] = useState(70);

  useEffect(() => {
    if (!showSetup) {
      return;
    }
    setProgress(70);
  }, [showSetup]);

  useEffect(() => {
    if (!showSetup) {
      return;
    }

    const start = performance.now();
    const minDuration = hasBootstrapData ? 180 : 700;
    const maxDuration = hasBootstrapData ? 360 : 1600;

    const tick = window.setInterval(() => {
      const elapsed = performance.now() - start;
      const ratio = Math.min(1, elapsed / maxDuration);
      const eased = 70 + 30 * (1 - Math.pow(1 - ratio, 2.2));
      const cap = bootstrap.isSuccess ? 100 : Math.min(96, eased);
      const floor = elapsed < minDuration ? Math.min(cap, 70 + (elapsed / minDuration) * 22) : cap;
      setProgress((current) => Math.max(current, floor));
      if (bootstrap.isSuccess && elapsed >= minDuration) {
        setProgress(100);
      }
    }, 40);

    return () => window.clearInterval(tick);
  }, [showSetup, bootstrap.isSuccess, hasBootstrapData]);

  const stepIndex = Math.min(
    SETUP_STEPS.length - 1,
    Math.floor((progress / 100) * SETUP_STEPS.length),
  );
  const stepLabel = SETUP_STEPS[stepIndex];

  if (showSetup) {
    return (
      <AppSetupScreen
        progress={progress}
        stepLabel={stepLabel}
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
    );
  }

  return <>{children}</>;
}
