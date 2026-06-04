import { NextResponse } from 'next/server';

import { BUSINESS_TIERS } from '@/lib/server/billing/plans';
import { upsertMerchantBilling } from '@/lib/server/billing/merchant-billing';
import { callPushEagleBilling } from '@/lib/server/billing/push-eagle-client';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const matchTierByPrice = (amount: number) => {
  const sorted = [...BUSINESS_TIERS].sort((a, b) => b.priceUsd - a.priceUsd);
  return sorted.find((tier) => Math.abs(tier.priceUsd - amount) < 0.01) ?? BUSINESS_TIERS[0];
};

export async function POST(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const sync = await callPushEagleBilling('/api/shopify/billing/sync', shopDomain, {});
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

    const tier = matchTierByPrice(Number(active.amount ?? 0));
    const billing = await upsertMerchantBilling({
      shopDomain,
      planKey: 'business',
      tierId: tier.id,
      impressionLimit: tier.impressions,
      priceUsd: tier.priceUsd,
      shopifySubscriptionId: String(active.id),
      status: 'active',
    });

    return NextResponse.json({ ok: true, activated: true, billing });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to confirm subscription.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
