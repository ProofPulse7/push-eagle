const currencyKey = (shop: string) => `pe:merchant-currency:${shop.trim().toLowerCase()}`;

export const readCachedMerchantCurrency = (shop: string): string | null => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return null;
  }

  try {
    const currency = localStorage.getItem(currencyKey(shop))?.trim().toUpperCase();
    return currency && currency.length === 3 ? currency : null;
  } catch {
    return null;
  }
};

export const writeCachedMerchantCurrency = (shop: string, currencyCode: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  const currency = currencyCode.trim().toUpperCase();
  if (currency.length !== 3) {
    return;
  }

  try {
    localStorage.setItem(currencyKey(shop), currency);
  } catch {
    // Ignore storage quota errors.
  }
};
