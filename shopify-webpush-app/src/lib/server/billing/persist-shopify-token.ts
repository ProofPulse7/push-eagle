import { upsertMerchantProfile } from '@/lib/server/data/store';

import { upsertShopifyStoreCredentials } from '@/lib/server/billing/shopify-credentials-store';
import { clearMerchantOfflineAccessToken } from '@/lib/server/billing/shopify-offline-token-refresh';
import { validateShopifyAccessToken } from '@/lib/server/billing/shopify-token-validation';

export const persistShopifyOfflineToken = async (input: {
  shopDomain: string;
  offlineAccessToken: string;
  scopes?: string | null;
  source: string;
  skipValidation?: boolean;
}) => {
  const shop = input.shopDomain.trim().toLowerCase();
  const token = input.offlineAccessToken.trim();

  if (!token) {
    return { saved: false, valid: false, reason: 'empty_token' as const };
  }

  const valid =
    input.skipValidation === true ? true : await validateShopifyAccessToken(shop, token);

  if (!valid) {
    await clearMerchantOfflineAccessToken(shop);
    return {
      saved: false,
      valid: false,
      reason: 'invalid_token' as const,
    };
  }

  await upsertShopifyStoreCredentials({
    shopDomain: shop,
    offlineAccessToken: token,
    scopes: input.scopes ?? null,
    source: input.source,
    tokenValid: true,
  });

  await upsertMerchantProfile({
    shopDomain: shop,
    shopifyOfflineAccessToken: token,
    scopes: input.scopes ?? null,
  });

  return {
    saved: true,
    valid: true,
    reason: null,
  };
};
