import { NextResponse } from 'next/server';

import { BASIC_PLAN, BUSINESS_TIERS } from '@/lib/server/billing/plans';
import { upsertMerchantBilling } from '@/lib/server/billing/merchant-billing';
import { syncActiveAppSubscription } from '@/lib/server/billing/sync-subscription';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const matchTierByPrice = (amount: number) => {
  const sorted = [...BUSINESS_TIERS].sort((a, b) => b.priceUsd - a.priceUsd);
  return sorted.find((tier) => Math.abs(tier.priceUsd - amount) < 0.01) ?? BUSINESS_TIERS[0];
};

export async function POST(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const sync = await syncActiveAppSubscription(shopDomain);
    const active = sync.active as
      | { id?: string; status?: string; amount?: number; name?: string }
      | null
      | undefined;

    if (!active?.id || active.status !== 'ACTIVE') {
      return NextResponse.json({
        ok: true,
        activated: false,
        message: 'Subscription not active yet. Approve the charge in Shopify if you have not already.',
      });
    }

    const amount = Number(active.amount ?? 0);
    const tier = matchTierByPrice(amount);
    const billing = await upsertMerchantBilling(
      amount <= 0.001
        ? {
            shopDomain,
            planKey: 'basic',
            tierId: null,
            impressionLimit: BASIC_PLAN.impressions,
            priceUsd: BASIC_PLAN.priceUsd,
            shopifySubscriptionId: String(active.id),
            status: 'active',
          }
        : {
            shopDomain,
            planKey: 'business',
            tierId: tier.id,
            impressionLimit: tier.impressions,
            priceUsd: tier.priceUsd,
            shopifySubscriptionId: String(active.id),
            status: 'active',
          },
    );

    return NextResponse.json({ ok: true, activated: true, billing });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to confirm subscription.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
