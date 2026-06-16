const MYSHOPIFY_SUFFIX = '.myshopify.com';

export const isMyshopifyHost = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }

  try {
    const hostname = trimmed.includes('://') ? new URL(trimmed).hostname : trimmed.split('/')[0];
    return hostname.toLowerCase().endsWith(MYSHOPIFY_SUFFIX);
  } catch {
    return trimmed.toLowerCase().endsWith(MYSHOPIFY_SUFFIX);
  }
};

export const normalizeMerchantWebsiteUrl = (raw: string | null | undefined): string => {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (isMyshopifyHost(parsed.hostname)) {
      return '';
    }
    parsed.pathname = parsed.pathname.replace(/\/$/, '') || '';
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    if (isMyshopifyHost(trimmed)) {
      return '';
    }
    return trimmed.replace(/\/$/, '');
  }
};

export const resolveMerchantWebsiteUrl = (input: {
  storeUrl?: string | null;
  primaryDomain?: string | null;
}): string => {
  const fromStore = normalizeMerchantWebsiteUrl(input.storeUrl);
  if (fromStore) {
    return fromStore;
  }

  return normalizeMerchantWebsiteUrl(input.primaryDomain);
};

export const formatStoreDisplayName = (storeUrl: string) => {
  const normalized = normalizeMerchantWebsiteUrl(storeUrl);
  if (!normalized) {
    return 'yourstore.com';
  }

  try {
    return new URL(normalized).hostname.replace(/^www\./i, '');
  } catch {
    return normalized.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
};
