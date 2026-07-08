'use client';

import { useEffect } from 'react';
import Script from 'next/script';

import { useShopDomain } from '@/hooks/use-shop-domain';

/** From tawk.to Administration → Channels → Chat Widget */
const TAWK_PROPERTY_ID = '6a4e5f62719f3a1d470d357f';
const TAWK_WIDGET_ID = '1jt1296i5';
const TAWK_EMBED_SRC = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;

type TawkApi = {
  onLoad?: () => void;
  setAttributes?: (
    attributes: Record<string, string>,
    callback?: (error?: Error | null) => void,
  ) => void;
};

declare global {
  interface Window {
    Tawk_API?: TawkApi;
    Tawk_LoadStart?: Date;
  }
}

/**
 * Loads the tawk.to live chat widget (same as their before-</body> embed).
 * Merchant shop domain is attached when available so agents see which store is chatting.
 */
export function TawkChatWidget() {
  const shop = useShopDomain();

  useEffect(() => {
    if (typeof window === 'undefined' || !shop) {
      return;
    }

    const applyShopVisitor = () => {
      const api = window.Tawk_API;
      if (!api || typeof api.setAttributes !== 'function') {
        return;
      }
      api.setAttributes({ name: shop, shop }, () => {
        // Chat still works if visitor attributes fail.
      });
    };

    window.Tawk_API = window.Tawk_API || {};
    const api = window.Tawk_API;
    const previousOnLoad = api.onLoad;
    api.onLoad = () => {
      previousOnLoad?.();
      applyShopVisitor();
    };

    applyShopVisitor();
  }, [shop]);

  return (
    <Script id="tawk-to-widget" strategy="lazyOnload">
      {`
var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
(function(){
  var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
  s1.async=true;
  s1.src='${TAWK_EMBED_SRC}';
  s1.charset='UTF-8';
  s1.setAttribute('crossorigin','*');
  s0.parentNode.insertBefore(s1,s0);
})();
      `}
    </Script>
  );
}
