const tokenKey = (shop: string) => `pe:merchant-preview-token:${shop.trim().toLowerCase()}`;

export const readCachedMerchantPreviewToken = (shop: string): string | null => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return null;
  }

  try {
    const token = sessionStorage.getItem(tokenKey(shop))?.trim();
    return token && token.length >= 10 ? token : null;
  } catch {
    return null;
  }
};

export const writeCachedMerchantPreviewToken = (shop: string, token: string) => {
  if (typeof window === 'undefined' || !shop.trim() || !token.trim()) {
    return;
  }

  try {
    sessionStorage.setItem(tokenKey(shop), token.trim());
  } catch {
    // Ignore storage quota errors.
  }
};

export const clearCachedMerchantPreviewToken = (shop: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    sessionStorage.removeItem(tokenKey(shop));
  } catch {
    // Ignore storage errors.
  }
};
