import { createRecurringAppSubscription } from '@/lib/server/billing/shopify-admin-billing';
import { hasShopifySessionDatabase } from '@/lib/server/billing/shopify-session';

export const startBusinessSubscriptionCheckout = async (input: {
  shopDomain: string;
  planName: string;
  priceUsd: number;
  returnUrl: string;
  test?: boolean;
}) => {
  if (!hasShopifySessionDatabase()) {
    throw new Error(
      'Billing database is not configured. On the dashboard Vercel project set SHOPIFY_SESSION_DATABASE_URL to the same Postgres URL as the Shopify app DATABASE_URL (with schema=shopify_sessions), or ensure NEON_DATABASE_URL is set.',
    );
  }

  return createRecurringAppSubscription(input);
};
