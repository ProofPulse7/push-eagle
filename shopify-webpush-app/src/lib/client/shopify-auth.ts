'use client';

const ROOT_APP_URL =
  process.env.NEXT_PUBLIC_SHOPIFY_ROOT_APP_URL?.trim() || 'https://push-eagle.vercel.app';

export const buildShopifyOAuthEntryUrl = (shopDomain: string, returnTo?: string) => {
  const url = new URL('/app', ROOT_APP_URL.replace(/\/$/, ''));
  url.searchParams.set('shop', shopDomain.trim().toLowerCase());

  if (returnTo) {
    url.searchParams.set('return_to', returnTo);
  }

  return url.toString();
};

export const normalizeShopInput = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  if (trimmed.endsWith('.myshopify.com')) {
    return trimmed;
  }
  return `${trimmed.replace(/\.myshopify\.com$/i, '')}.myshopify.com`;
};
