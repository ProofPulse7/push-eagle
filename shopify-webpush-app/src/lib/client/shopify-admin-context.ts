'use client';

const SHOPIFY_ADMIN_QUERY_KEYS = ['shop', 'host', 'embedded', 'locale'] as const;

export const readShopifyAdminParams = () => {
  if (typeof window === 'undefined') {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
};

export const withShopifyAdminContext = (path: string, params = readShopifyAdminParams()) => {
  const nextParams = new URLSearchParams();

  for (const key of SHOPIFY_ADMIN_QUERY_KEYS) {
    const value = params.get(key);
    if (value) {
      nextParams.set(key, value);
    }
  }

  if (!nextParams.get('embedded') && nextParams.get('host')) {
    nextParams.set('embedded', '1');
  }

  const query = nextParams.toString();
  return query ? `${path}?${query}` : path;
};

export const isEmbeddedShopifyAdmin = (params = readShopifyAdminParams()) =>
  params.get('embedded') === '1' || Boolean(params.get('host'));
