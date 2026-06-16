export const SHOPIFY_APP_CLIENT_ID =
  process.env.NEXT_PUBLIC_SHOPIFY_API_KEY?.trim() || 'c866e24e9ce383cebeee6edb01496449';

export const PUSH_EAGLE_THEME_EMBED_HANDLE = 'star_rating';
export const PUSH_EAGLE_THEME_EMBED_NAME = 'Push Eagle Notifications';

export const buildThemeAppEmbedDeepLink = (shopDomain: string): string | null => {
  const shop = shopDomain.trim().toLowerCase();
  if (!shop.endsWith('.myshopify.com')) {
    return null;
  }

  const storeHandle = shop.slice(0, -'.myshopify.com'.length);
  const params = new URLSearchParams({
    context: 'apps',
    activateAppId: `${SHOPIFY_APP_CLIENT_ID}/${PUSH_EAGLE_THEME_EMBED_HANDLE}`,
  });

  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/themes/current/editor?${params.toString()}`;
};
