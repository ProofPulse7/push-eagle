import { z } from 'zod';

const shopSchema = z.string().min(3).regex(/\.myshopify\.com$/i, 'shopDomain must end with .myshopify.com');

export const normalizeShopDomain = (value: string) => value.trim().toLowerCase();

export const parseShopDomain = (value: unknown) => {
  const parsed = shopSchema.parse(value);
  return normalizeShopDomain(parsed);
};

export const extractShopDomain = (request: Request, bodyShopDomain?: unknown) => {
  const url = new URL(request.url);
  const queryShop = url.searchParams.get('shop');
  const headerShop = request.headers.get('x-shop-domain');

  return parseShopDomain(bodyShopDomain ?? headerShop ?? queryShop);
};
