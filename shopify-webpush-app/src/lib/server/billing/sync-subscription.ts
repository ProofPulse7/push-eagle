import { getActiveAppSubscription } from '@/lib/server/billing/shopify-admin-billing';
import { hasShopifySessionDatabase } from '@/lib/server/billing/shopify-session';

export const syncActiveAppSubscription = async (shopDomain: string) => {
  if (!hasShopifySessionDatabase()) {
    return { active: null };
  }

  const active = await getActiveAppSubscription(shopDomain);
  return { active };
};
