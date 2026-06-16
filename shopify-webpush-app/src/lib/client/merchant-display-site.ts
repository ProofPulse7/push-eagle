export const resolveMerchantDisplaySiteName = (storeUrl: string, shopDomain: string) => {
  const trimmedUrl = storeUrl?.trim();
  if (trimmedUrl) {
    try {
      const normalized = trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`;
      return new URL(normalized).hostname.replace(/^www\./i, '');
    } catch {
      return trimmedUrl.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    }
  }

  if (shopDomain?.trim()) {
    return shopDomain.trim().replace(/\.myshopify\.com$/i, '');
  }

  return 'Your store';
};
