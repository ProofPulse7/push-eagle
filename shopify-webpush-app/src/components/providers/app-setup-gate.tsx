'use client';

import { usePathname } from 'next/navigation';

import { usePersistRestored } from '@/components/providers/query-provider';
import { useShopDomain } from '@/hooks/use-shop-domain';

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
 * Only blocks until persisted React Query cache is restored.
 * Bootstrap and page data load in the background so the shell opens immediately.
 */
export function AppSetupGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shop = useShopDomain();
  const isRestored = usePersistRestored();
  const skip = shouldSkipSetup(pathname);
  const isReady = skip || !shop || isRestored;

  if (!isReady) {
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
