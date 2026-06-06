import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  BASIC_PLAN,
  getBusinessTier,
} from '@/lib/server/billing/plans';
import {
  basicCheckoutPlanName,
  startPlanSubscriptionCheckout,
} from '@/lib/server/billing/start-plan-checkout';
import { buildShopifyReauthorizeUrl } from '@/lib/server/billing/shopify-offline-token-refresh';
import { env } from '@/lib/config/env';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const bodySchema = z.object({
  shopDomain: z.string().optional(),
  planKey: z.enum(['basic', 'business']),
  tierId: z.string().optional(),
});

export async function POST(request: Request) {
  let shopDomain: string | null = null;
  try {
    const body = bodySchema.parse(await request.json());
    shopDomain = extractShopDomain(request, body.shopDomain);
    const appUrl = env.NEXT_PUBLIC_APP_URL;
    const returnUrl = new URL('/plans', appUrl);
    returnUrl.searchParams.set('shop', shopDomain);
    returnUrl.searchParams.set('billing', 'return');

    if (body.planKey === 'basic') {
      const result = await startPlanSubscriptionCheckout({
        shopDomain,
        planKey: 'basic',
        planName: basicCheckoutPlanName(),
        priceUsd: BASIC_PLAN.priceUsd,
        returnUrl: returnUrl.toString(),
        impressionLimit: BASIC_PLAN.impressions,
        tierId: null,
      });

      return NextResponse.json({
        ok: true,
        confirmationUrl: result.confirmationUrl,
        subscriptionId: result.subscriptionId,
        billing: result.billing,
        test: result.test,
      });
    }

    const tier = getBusinessTier(body.tierId || '');
    if (!tier) {
      return NextResponse.json({ ok: false, error: 'Invalid business tier.' }, { status: 400 });
    }

    const result = await startPlanSubscriptionCheckout({
      shopDomain,
      planKey: 'business',
      planName: `Push Eagle Business (${tier.impressions.toLocaleString()} impressions)`,
      priceUsd: tier.priceUsd,
      returnUrl: returnUrl.toString(),
      impressionLimit: tier.impressions,
      tierId: tier.id,
    });

    return NextResponse.json({
      ok: true,
      confirmationUrl: result.confirmationUrl,
      subscriptionId: result.subscriptionId,
      billing: result.billing,
      test: result.test,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start subscription.';
    const reauthorizeUrl =
      shopDomain && message.includes('No valid Shopify offline token')
        ? buildShopifyReauthorizeUrl(shopDomain)
        : null;

    return NextResponse.json(
      {
        ok: false,
        error: message,
        reauthorizeUrl,
        diagnosticsPath: '/diagnostics/shopify-billing',
      },
      { status: message.includes('No valid Shopify offline token') ? 502 : 400 },
    );
  }
}
