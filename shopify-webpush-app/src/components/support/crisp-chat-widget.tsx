'use client';

import { useEffect } from 'react';
import Script from 'next/script';

import { useShopDomain } from '@/hooks/use-shop-domain';

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

/**
 * Loads the Crisp live chat widget (website ID from Crisp Setup & Integrations).
 * Equivalent to their official HTML head snippet for Next.js App Router.
 */
export function CrispChatWidget() {
  const shop = useShopDomain();

  useEffect(() => {
    if (typeof window === 'undefined' || !shop || !window.$crisp) {
      return;
    }

    window.$crisp.push(['set', 'session:data', [[['shop', shop]]]]);
    window.$crisp.push(['set', 'user:nickname', [shop]]);
  }, [shop]);

  return (
    <Script id="crisp-chat-widget" strategy="afterInteractive">
      {`
window.$crisp=[];window.CRISP_WEBSITE_ID="${CRISP_WEBSITE_ID}";
(function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();
      `}
    </Script>
  );
}
