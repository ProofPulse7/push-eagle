import { NextResponse } from 'next/server';
import { z } from 'zod';

import { activateSubscribedPlan, runPlanSubscribe } from '@/lib/server/billing/run-plan-subscribe';
import { buildShopifyReauthorizeUrl } from '@/lib/server/billing/shopify-offline-token-refresh';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const bodySchema = z.object({
  shopDomain: z.string().optional(),
  planKey: z.enum(['basic', 'business']),
  tierId: z.string().optional(),
  host: z.string().optional(),
  embedded: z.string().optional(),
});

export async function POST(request: Request) {
  let shopDomain: string | null = null;
  try {
    const body = bodySchema.parse(await request.json());
    shopDomain = extractShopDomain(request, body.shopDomain);

    const result = await runPlanSubscribe({
      shopDomain,
      planKey: body.planKey,
      tierId: body.tierId,
      host: body.host,
      embedded: body.embedded,
    });

    if (result.autoActivated) {
      const billing = await activateSubscribedPlan(shopDomain, result);
      return NextResponse.json({
        ok: true,
        activated: true,
        confirmationUrl: null,
        subscriptionId: result.subscriptionId,
        billing,
        test: result.test,
      });
    }

    return NextResponse.json({
      ok: true,
      confirmationUrl: result.confirmationUrl,
      subscriptionId: result.subscriptionId,
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
