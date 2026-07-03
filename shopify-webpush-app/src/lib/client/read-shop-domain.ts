/** Synchronous shop resolution for navigation, cache checks, and storage keys. */
export const readShopDomainSync = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const queryShop = new URLSearchParams(window.location.search).get('shop');
  if (queryShop?.trim()) {
    return queryShop.trim().toLowerCase();
  }

  const cookieShop = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('pe_shop='))
    ?.slice('pe_shop='.length);

  if (cookieShop?.trim()) {
    return cookieShop.trim().toLowerCase();
  }

  const scopedKeys = Object.keys(localStorage).filter((key) => key.startsWith('pe:') && key.endsWith(':shopDomain'));
  for (const key of scopedKeys) {
    const value = localStorage.getItem(key)?.trim().toLowerCase();
    if (value?.endsWith('.myshopify.com')) {
      return value;
    }
  }

  const stored = localStorage.getItem('shopDomain')?.trim().toLowerCase();
  return stored ?? '';
};
