'use client';

import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';

import { TopLoadingBar } from '@/components/ui/top-loading-bar';

/**
 * Global top loading bar for navigation and in-flight queries/mutations.
 */
export function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fetchingCount = useIsFetching();
  const mutatingCount = useIsMutating();
  const [navActive, setNavActive] = useState(false);
  const [navProgress, setNavProgress] = useState(0);

  const queryActive = fetchingCount > 0 || mutatingCount > 0;

  useEffect(() => {
    setNavActive(true);
    setNavProgress(18);

    const mid = window.setTimeout(() => setNavProgress(62), 120);
    const done = window.setTimeout(() => {
      setNavProgress(100);
      window.setTimeout(() => {
        setNavActive(false);
        setNavProgress(0);
      }, 220);
    }, 340);

    return () => {
      window.clearTimeout(mid);
      window.clearTimeout(done);
    };
  }, [pathname]);

  const active = navActive || queryActive;
  const progress = navActive ? navProgress : queryActive ? undefined : 0;

  return (
    <>
      <TopLoadingBar active={active} progress={progress} />
      {children}
    </>
  );
}
