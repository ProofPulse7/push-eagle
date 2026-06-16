'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

import { TopLoadingBar } from '@/components/ui/top-loading-bar';

/** Top loading bar for route navigation only — not background query refetches. */
export function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navActive, setNavActive] = useState(false);
  const [navProgress, setNavProgress] = useState(0);

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

  return (
    <>
      <TopLoadingBar active={navActive} progress={navProgress} />
      {children}
    </>
  );
}
