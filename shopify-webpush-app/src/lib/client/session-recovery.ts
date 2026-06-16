'use client';

const ROOT_APP_URL = (
  process.env.NEXT_PUBLIC_SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app'
).replace(/\/$/, '');

const readShopFromCookie = () => {
  if (typeof document === 'undefined') {
    return '';
  }

  const cookieShop = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('pe_shop='))
    ?.slice('pe_shop='.length);

  return cookieShop?.trim().toLowerCase() ?? '';
};

export const buildReconnectUrl = (shop: string, returnTo?: string) => {
  const connectUrl = new URL(`${ROOT_APP_URL}/app`);
  connectUrl.searchParams.set('shop', shop.trim().toLowerCase());

  if (returnTo) {
    connectUrl.searchParams.set('return_to', returnTo);
  }

  return connectUrl.toString();
};

let recoveryInFlight = false;

export const triggerSessionRecovery = (reauthorizeUrl?: string) => {
  if (typeof window === 'undefined' || recoveryInFlight) {
    return;
  }

  recoveryInFlight = true;

  const target =
    reauthorizeUrl?.trim() ||
    (() => {
      const shop =
        readShopFromCookie() ||
        new URLSearchParams(window.location.search).get('shop')?.trim().toLowerCase() ||
        '';
      if (!shop) {
        return null;
      }
      return buildReconnectUrl(shop, window.location.href);
    })();

  if (target) {
    window.location.href = target;
  } else {
    recoveryInFlight = false;
  }
};
