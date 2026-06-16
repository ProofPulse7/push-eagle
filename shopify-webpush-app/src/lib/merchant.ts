const DEFAULT_LOCALE = 'en-US';
const DEFAULT_CURRENCY = 'USD';

let displayLocale = DEFAULT_LOCALE;
let displayCurrency = DEFAULT_CURRENCY;

export const setMerchantDisplayFormat = (currencyCode: string, locale?: string) => {
  const currency = currencyCode?.trim().toUpperCase();
  if (currency) {
    displayCurrency = currency;
  }

  if (locale?.trim()) {
    displayLocale = locale.trim();
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
