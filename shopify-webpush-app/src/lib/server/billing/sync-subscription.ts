import { getActiveAppSubscription } from '@/lib/server/billing/shopify-admin-billing';
import { callPushEagleBilling } from '@/lib/server/billing/push-eagle-client';
import { env } from '@/lib/config/env';

export const syncActiveAppSubscription = async (shopDomain: string) => {
  if (env.SHOPIFY_SESSION_DATABASE_URL.trim()) {
    const active = await getActiveAppSubscription(shopDomain);
    return { active };
  }

  const result = await callPushEagleBilling('/api/shopify/billing/sync', shopDomain, {});
  return {
    active: (result.active ?? null) as
      | { id?: string; status?: string; amount?: number; name?: string }
      | null,
  };
};
