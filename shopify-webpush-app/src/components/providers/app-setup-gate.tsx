'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { AppSetupScreen } from '@/components/ui/loading-ui';
import { useAppBootstrap } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';

const SETUP_STEPS = [
  'Preparing your workspace…',
  'Loading saved settings…',
  'Almost ready…',
] as const;

const shouldSkipSetup = (pathname: string) => {
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/connect') ||
    pathname.startsWith('/shopify-login')
  ) {
    return true;
  }
  if (pathname.startsWith('/campaigns/new')) {
    return true;
  }
  return /^\/automations\/[a-zA-Z0-9-]+\/[^/]+\/edit$/.test(pathname);
};

/**
 * Blocks only on cold start (no cached bootstrap). Cached sessions skip instantly.
 * Progress jumps to 70% immediately, then eases to 100% with accurate timing.
 */
export function AppSetupGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const bootstrap = useAppBootstrap();
  const skip = shouldSkipSetup(pathname);

  const hasCachedBootstrap = Boolean(
    shop && queryClient.getQueryData(['pe', shop, 'bootstrap']),
  );
  const hasBootstrapData = Boolean(bootstrap.data) || hasCachedBootstrap;

  const isReady =
    skip || !shop || bootstrap.isSuccess || (hasBootstrapData && !bootstrap.isPending);
  const showSetup = !skip && Boolean(shop) && !isReady && !hasCachedBootstrap;

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
    const minDuration = hasBootstrapData ? 280 : 1400;
    const maxDuration = hasBootstrapData ? 520 : 2800;

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
