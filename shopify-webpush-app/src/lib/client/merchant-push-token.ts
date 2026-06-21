const merchantPushTokenKey = (shop: string) => `pe:merchant-push-token:${shop.trim().toLowerCase()}`;

export const readMerchantPushToken = (shop: string): string | null => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return null;
  }

  try {
    const token = localStorage.getItem(merchantPushTokenKey(shop));
    return token && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
};

export const writeMerchantPushToken = (shop: string, token: string) => {
  if (typeof window === 'undefined' || !shop.trim() || !token.trim()) {
    return;
  }

  try {
    localStorage.setItem(merchantPushTokenKey(shop), token.trim());
  } catch {
    // Ignore storage quota errors.
  }
};

export const clearMerchantPushToken = (shop: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  try {
    localStorage.removeItem(merchantPushTokenKey(shop));
  } catch {
    // Ignore storage errors.
  }
};
