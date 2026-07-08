'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

declare global {
  interface Window {
    $crisp?: Array<unknown> & { push: (args: unknown[]) => void };
  }
}

/** Pages where the fullscreen composer should not show the Crisp chatbox. */
const isCrispHiddenPath = (pathname: string) => {
  if (pathname.startsWith('/campaigns/new/editor')) {
    return true;
  }

  return /^\/automations\/[^/]+\/[^/]+\/edit$/.test(pathname);
};

/**
 * Crisp recommends calling chat:hide / chat:show when SPA routes change.
 * @see https://help.crisp.chat/en/article/how-to-programmatically-hide-and-show-the-chatbox-13l0f8e/
 */
export function CrispChatRouteVisibility() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined' || !window.$crisp) {
      return;
    }

    window.$crisp.push(['do', isCrispHiddenPath(pathname) ? 'chat:hide' : 'chat:show']);
  }, [pathname]);

  return null;
}
