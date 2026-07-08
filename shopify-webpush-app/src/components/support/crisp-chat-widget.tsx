'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';

import { useShopDomain } from '@/hooks/use-shop-domain';

import './crisp-chat-widget.css';

const CRISP_WEBSITE_ID = 'bff5f4a5-d8a1-4cc8-bb0d-22330b97ae91';

type CrispRuntime = {
  push: (args: unknown[]) => void;
};

declare global {
  interface Window {
    $crisp?: CrispRuntime;
    CRISP_WEBSITE_ID?: string;
  }
}

const isCrispExcludedPath = (pathname: string) => {
  if (pathname.startsWith('/campaigns/new/editor')) {
    return true;
  }

  return /^\/automations\/[a-zA-Z0-9-]+\/[^/]+\/edit$/.test(pathname);
};

/**
 * Loads the Crisp live chat widget (website ID from Crisp Setup & Integrations).
 * Hidden on fullscreen composers (campaign editor and automation reminder editors).
 */
export function CrispChatWidget() {
  const shop = useShopDomain();
  const pathname = usePathname();
  const excluded = isCrispExcludedPath(pathname);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.$crisp) {
      return;
    }

    window.$crisp.push(['do', excluded ? 'chat:hide' : 'chat:show']);

    if (!excluded && shop) {
      window.$crisp.push(['set', 'session:data', [[['shop', shop]]]]);
      window.$crisp.push(['set', 'user:nickname', [shop]]);
    }
  }, [shop, excluded]);

  if (excluded) {
    return null;
  }

  return (
    <Script id="crisp-chat-widget" strategy="afterInteractive">
      {`
window.$crisp=[];window.CRISP_WEBSITE_ID="${CRISP_WEBSITE_ID}";
(function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();
      `}
    </Script>
  );
}
