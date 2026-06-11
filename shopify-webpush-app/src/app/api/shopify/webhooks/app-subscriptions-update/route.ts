import { NextResponse } from 'next/server';

import { verifyShopifyWebhookSignature } from '@/lib/integrations/shopify/verify';
import { BASIC_PLAN } from '@/lib/server/billing/plans';
import { upsertMerchantBilling } from '@/lib/server/billing/merchant-billing';
import {
  handleDeclinedAppSubscription,
  matchTierByPrice,
} from '@/lib/server/billing/sync-billing-from-shopify';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

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
      await upsertMerchantBilling(
        price <= 0.001
          ? {
              shopDomain,
              planKey: 'basic',
              tierId: null,
              impressionLimit: BASIC_PLAN.impressions,
              priceUsd: BASIC_PLAN.priceUsd,
              shopifySubscriptionId: subscription.admin_graphql_api_id ?? null,
              status: 'active',
            }
          : {
              shopDomain,
              planKey: 'business',
              tierId: tier.id,
              impressionLimit: tier.impressions,
              priceUsd: tier.priceUsd,
              shopifySubscriptionId: subscription.admin_graphql_api_id ?? null,
              status: 'active',
            },
      );
    } else if (status === 'CANCELLED' || status === 'DECLINED' || status === 'EXPIRED') {
      await handleDeclinedAppSubscription(shopDomain);
    }

    return NextResponse.json({ ok: true, shopDomain });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
