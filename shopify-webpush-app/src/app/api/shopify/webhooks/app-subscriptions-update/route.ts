import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { BUSINESS_TIERS } from '@/lib/server/billing/plans';
import { upsertMerchantBilling } from '@/lib/server/billing/merchant-billing';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const matchTierByPrice = (amount: number) => {
  const sorted = [...BUSINESS_TIERS].sort((a, b) => b.priceUsd - a.priceUsd);
  return sorted.find((tier) => Math.abs(tier.priceUsd - amount) < 0.01) ?? BUSINESS_TIERS[0];
};

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-shopify-hmac-sha256');
    if (!verifyShopifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook signature.' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as {
      app_subscription?: {
        admin_graphql_api_id?: string;
        status?: string;
        price?: string;
      };
    };

    const shopDomain = parseShopDomain(request.headers.get('x-shopify-shop-domain') || '');
    const subscription = payload.app_subscription;
    if (!subscription) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const status = String(subscription.status || '').toUpperCase();
    const price = Number(subscription.price ?? 0);

    if (status === 'ACTIVE') {
      const tier = matchTierByPrice(price);
      await upsertMerchantBilling({
        shopDomain,
        planKey: 'business',
        tierId: tier.id,
        impressionLimit: tier.impressions,
        priceUsd: tier.priceUsd,
        shopifySubscriptionId: subscription.admin_graphql_api_id ?? null,
        status: 'active',
      });
    } else if (status === 'CANCELLED' || status === 'DECLINED' || status === 'EXPIRED') {
      await upsertMerchantBilling({
        shopDomain,
        planKey: 'basic',
        tierId: null,
        impressionLimit: 10_000,
        priceUsd: 0,
        status: 'active',
      });
    }

    return NextResponse.json({ ok: true, shopDomain });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
