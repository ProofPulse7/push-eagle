'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { isEmbeddedShopifyAdmin } from '@/lib/client/shopify-admin-context';

const ROOT_APP_URL = (process.env.NEXT_PUBLIC_SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app').replace(
  /\/$/,
  '',
);

const hasAuthCookie = () =>
  typeof document !== 'undefined' &&
  document.cookie.split(';').some((part) => part.trim() === 'pe_authenticated=1');

/**
 * In embedded Shopify Admin, break out to the Remix OAuth app once when session cookies are missing.
 */
export function ShopifyEmbeddedAuthBootstrap() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isEmbeddedShopifyAdmin(searchParams)) {
      return;
    }

    if (hasAuthCookie() || searchParams.get('from_sso') === '1') {
      return;
    }

    const shop = searchParams.get('shop');
    const host = searchParams.get('host');
    if (!shop) {
      return;
    }

    const returnTo = window.location.href;
    const connectUrl = new URL(`${ROOT_APP_URL}/app`);
    connectUrl.searchParams.set('shop', shop);
    if (host) {
      connectUrl.searchParams.set('host', host);
    }
    connectUrl.searchParams.set('embedded', '1');
    connectUrl.searchParams.set('return_to', returnTo);

    const target = window.top ?? window;
    target.location.href = connectUrl.toString();
  }, [searchParams]);

  return null;
}
