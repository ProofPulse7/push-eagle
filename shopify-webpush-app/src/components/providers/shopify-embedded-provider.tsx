'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { isEmbeddedShopifyAdmin } from '@/lib/client/shopify-admin-context';

const ROOT_APP_URL = (process.env.NEXT_PUBLIC_SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app').replace(
  /\/$/,
  '',
);

const OAUTH_ATTEMPT_KEY = 'pe_embedded_oauth_attempt';

const hasClientAuthHint = () =>
  typeof document !== 'undefined' && document.cookie.split(';').some((part) => part.trim() === 'pe_client_auth=1');

const redirectTopLevel = (url: string) => {
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_top';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  } catch {
    // Fall through to location.assign on the current frame.
  }

  window.location.assign(url);
};

/**
 * In embedded Shopify Admin, send the merchant through Remix OAuth once when the server session is missing.
 */
export function ShopifyEmbeddedAuthBootstrap() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isEmbeddedShopifyAdmin(searchParams)) {
      return;
    }

    if (searchParams.get('from_sso') === '1' || hasClientAuthHint()) {
      try {
        sessionStorage.removeItem(OAUTH_ATTEMPT_KEY);
      } catch {
        // Ignore storage errors in restricted iframe contexts.
      }
      return;
    }

    const shop = searchParams.get('shop');
    const host = searchParams.get('host');
    if (!shop) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/integrations/shopify/session-check?shop=${encodeURIComponent(shop)}`,
          { credentials: 'include' },
        );
        const payload = (await response.json()) as { authenticated?: boolean };
        if (cancelled || payload.authenticated) {
          return;
        }
      } catch {
        if (cancelled) {
          return;
        }
      }

      try {
        if (sessionStorage.getItem(OAUTH_ATTEMPT_KEY) === '1') {
          return;
        }
        sessionStorage.setItem(OAUTH_ATTEMPT_KEY, '1');
      } catch {
        // Continue even if sessionStorage is unavailable.
      }

      const returnTo = window.location.href;
      const connectUrl = new URL(`${ROOT_APP_URL}/app`);
      connectUrl.searchParams.set('shop', shop);
      if (host) {
        connectUrl.searchParams.set('host', host);
      }
      connectUrl.searchParams.set('embedded', '1');
      connectUrl.searchParams.set('return_to', returnTo);

      redirectTopLevel(connectUrl.toString());
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return null;
}
