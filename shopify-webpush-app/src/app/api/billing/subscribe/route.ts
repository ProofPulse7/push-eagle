import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  BASIC_PLAN,
  getBusinessTier,
  type PlanKey,
} from '@/lib/server/billing/plans';
import { upsertMerchantBilling } from '@/lib/server/billing/merchant-billing';
import { startBusinessSubscriptionCheckout } from '@/lib/server/billing/create-subscription';
import { env } from '@/lib/config/env';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const bodySchema = z.object({
  shopDomain: z.string().optional(),
  planKey: z.enum(['basic', 'business']),
  tierId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const appUrl = env.NEXT_PUBLIC_APP_URL;
    const returnUrl = new URL('/plans', appUrl);
    returnUrl.searchParams.set('shop', shopDomain);
    returnUrl.searchParams.set('billing', 'return');

    if (body.planKey === 'basic') {
      const billing = await upsertMerchantBilling({
        shopDomain,
        planKey: 'basic',
        tierId: null,
        impressionLimit: BASIC_PLAN.impressions,
        priceUsd: 0,
        shopifySubscriptionId: null,
        status: 'active',
      });
      return NextResponse.json({ ok: true, activated: true, billing, confirmationUrl: null });
    }

    const tier = getBusinessTier(body.tierId || '');
    if (!tier) {
      return NextResponse.json({ ok: false, error: 'Invalid business tier.' }, { status: 400 });
    }

    const billing = await upsertMerchantBilling({
      shopDomain,
      planKey: 'business',
      tierId: tier.id,
      impressionLimit: tier.impressions,
      priceUsd: tier.priceUsd,
      status: 'pending',
    });

    try {
      const result = await startBusinessSubscriptionCheckout({
        shopDomain,
        planName: `Push Eagle Business (${tier.impressions.toLocaleString()} impressions)`,
        priceUsd: tier.priceUsd,
        returnUrl: returnUrl.toString(),
        test: process.env.SHOPIFY_BILLING_TEST === 'true',
      });

      return NextResponse.json({
        ok: true,
        confirmationUrl: result.confirmationUrl,
        subscriptionId: result.subscriptionId,
        billing,
      });
    } catch (billingError) {
      const message =
        billingError instanceof Error
          ? billingError.message
          : 'Could not start Shopify billing. Open the app from Shopify admin and try again.';
      return NextResponse.json({ ok: false, error: message, billing }, { status: 502 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start subscription.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
