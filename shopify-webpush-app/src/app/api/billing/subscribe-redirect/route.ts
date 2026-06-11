import { NextResponse } from 'next/server';

import { buildBillingReturnUrl } from '@/lib/server/billing/build-billing-return-url';
import { activateSubscribedPlan, runPlanSubscribe } from '@/lib/server/billing/run-plan-subscribe';
import { buildShopifyReauthorizeUrl } from '@/lib/server/billing/shopify-offline-token-refresh';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const pickParam = (value: string | null) => value?.trim() || null;

export async function GET(request: Request) {
  let shopDomain: string | null = null;
  try {
    const url = new URL(request.url);
    shopDomain = extractShopDomain(request, url.searchParams.get('shop'));
    const planKey = url.searchParams.get('planKey');
    if (planKey !== 'basic' && planKey !== 'business') {
      return NextResponse.json({ ok: false, error: 'Invalid plan.' }, { status: 400 });
    }

    const result = await runPlanSubscribe({
      shopDomain,
      planKey,
      tierId: pickParam(url.searchParams.get('tierId')) ?? undefined,
      host: pickParam(url.searchParams.get('host')),
      embedded: pickParam(url.searchParams.get('embedded')),
    });

    if (result.autoActivated) {
      await activateSubscribedPlan(shopDomain, result);
      return NextResponse.redirect(
        buildBillingReturnUrl(shopDomain, {
          host: pickParam(url.searchParams.get('host')),
          embedded: pickParam(url.searchParams.get('embedded')),
        }),
      );
    }

    if (!result.confirmationUrl) {
      return NextResponse.json(
        { ok: false, error: 'Shopify did not return a billing confirmation URL.' },
        { status: 502 },
      );
    }

    return NextResponse.redirect(result.confirmationUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start subscription.';
    const reauthorizeUrl =
      shopDomain && message.includes('No valid Shopify offline token')
        ? buildShopifyReauthorizeUrl(shopDomain)
        : null;

    return NextResponse.json(
      { ok: false, error: message, reauthorizeUrl },
      { status: message.includes('No valid Shopify offline token') ? 502 : 400 },
    );
  }
}
