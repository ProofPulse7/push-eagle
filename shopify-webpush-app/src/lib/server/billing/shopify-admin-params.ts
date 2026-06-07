const SHOPIFY_ADMIN_QUERY_KEYS = [
  'shop',
  'host',
  'embedded',
  'id_token',
  'session',
  'locale',
  'timestamp',
  'hmac',
] as const;

export type ShopifyAdminSearchParams = Record<string, string | string[] | undefined>;

const pickParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const appendShopifyAdminParams = (
  target: URL,
  source: ShopifyAdminSearchParams,
  options?: { includeShop?: boolean },
) => {
  const includeShop = options?.includeShop ?? true;

  for (const key of SHOPIFY_ADMIN_QUERY_KEYS) {
    if (!includeShop && key === 'shop') {
      continue;
    }

    const value = pickParam(source[key]);
    if (value) {
      target.searchParams.set(key, value);
    }
  }
};
