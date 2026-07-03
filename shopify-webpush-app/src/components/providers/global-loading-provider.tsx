'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { TopLoadingBar } from '@/components/ui/top-loading-bar';
import { hasRouteWarmCache } from '@/lib/client/route-cache-ready';
import { useShopDomain } from '@/hooks/use-shop-domain';

/** Thin top bar only for cold navigations — warm cached routes stay silent. */
export function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const previousPath = useRef(pathname);
  const [navActive, setNavActive] = useState(false);
  const [navProgress, setNavProgress] = useState(0);

  useEffect(() => {
    if (previousPath.current === pathname) {
      return;
    }
    previousPath.current = pathname;

    if (hasRouteWarmCache(queryClient, shop, pathname)) {
      setNavActive(false);
      setNavProgress(0);
      return;
    }

    setNavActive(true);
    setNavProgress(28);

    const mid = window.setTimeout(() => setNavProgress(70), 90);
    const done = window.setTimeout(() => {
      setNavProgress(100);
      window.setTimeout(() => {
        setNavActive(false);
        setNavProgress(0);
      }, 160);
    }, 240);

    return () => {
      window.clearTimeout(mid);
      window.clearTimeout(done);
    };
  }, [pathname, queryClient, shop]);

  return (
    <>
      <TopLoadingBar active={navActive} progress={navProgress} />
      {children}
    </>
  );
}
