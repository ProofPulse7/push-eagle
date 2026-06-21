const DEFAULT_LOCALE = 'en-US';
const DEFAULT_CURRENCY = 'USD';

const CURRENCY_LOCALE: Record<string, string> = {
  PKR: 'en-PK',
  INR: 'en-IN',
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'de-DE',
  CAD: 'en-CA',
  AUD: 'en-AU',
  AED: 'en-AE',
  SAR: 'ar-SA',
};

let displayLocale = DEFAULT_LOCALE;
let displayCurrency = DEFAULT_CURRENCY;

const currencyStorageKey = (shop: string) => `pe:currency:${shop.trim().toLowerCase()}`;

export const readPersistedMerchantCurrency = (shop: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return '';
  }

  try {
    return localStorage.getItem(currencyStorageKey(shop))?.trim().toUpperCase() ?? '';
  } catch {
    return '';
  }
};

export const persistMerchantCurrency = (shop: string, currencyCode: string) => {
  if (typeof window === 'undefined' || !shop.trim()) {
    return;
  }

  const currency = currencyCode.trim().toUpperCase();
  if (!currency) {
    return;
  }

  try {
    localStorage.setItem(currencyStorageKey(shop), currency);
  } catch {
    // Ignore storage quota errors.
  }
};

export const setMerchantDisplayFormat = (currencyCode: string, locale?: string, shop?: string) => {
  const currency = currencyCode?.trim().toUpperCase();
  if (currency) {
    displayCurrency = currency;
    if (shop?.trim()) {
      persistMerchantCurrency(shop, currency);
    }
  }

  if (locale?.trim()) {
    displayLocale = locale.trim();
  } else if (currency && CURRENCY_LOCALE[currency]) {
    displayLocale = CURRENCY_LOCALE[currency];
  }
};

export const hydrateMerchantDisplayFormat = (shop: string, currencyCode?: string | null) => {
  const persisted = readPersistedMerchantCurrency(shop);
  const currency = String(currencyCode ?? persisted ?? '').trim().toUpperCase();
  if (currency) {
    setMerchantDisplayFormat(currency, CURRENCY_LOCALE[currency], shop);
  }
};

export const getMerchantDisplayFormat = () => ({
  locale: displayLocale,
  currency: displayCurrency,
});

/** @deprecated Use getMerchantDisplayFormat() — kept for older imports. */
export const merchantConfig = {
  get locale() {
    return displayLocale;
  },
  get currency() {
    return displayCurrency;
  },
};
