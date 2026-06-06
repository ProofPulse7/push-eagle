import { z } from 'zod';

const shopSchema = z.string().min(3).regex(/\.myshopify\.com$/i, 'shopDomain must end with .myshopify.com');

export const normalizeShopDomain = (value: string) => value.trim().toLowerCase();

export const parseShopDomain = (value: unknown) => {
  const parsed = shopSchema.parse(value);
  return normalizeShopDomain(parsed);
};

const getCookieValue = (cookieHeader: string | null, key: string) => {
  if (!cookieHeader) {
    return null;
  }

  const entry = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`));

  if (!entry) {
    return null;
  }

  return entry.slice(`${key}=`.length);
};

export const extractShopDomain = (request: Request, bodyShopDomain?: unknown) => {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get('shop');
  const headerShop = request.headers.get('x-shop-domain');
  const shopifyHeaderShop = request.headers.get('x-shopify-shop-domain');
  const cookieShop = getCookieValue(request.headers.get('cookie'), 'pe_shop');

  return parseShopDomain(bodyShopDomain ?? headerShop ?? shopifyHeaderShop ?? queryShop ?? cookieShop);
};
