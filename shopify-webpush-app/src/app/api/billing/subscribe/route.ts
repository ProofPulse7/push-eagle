import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isBillingReauthRequired } from '@/lib/server/billing/billing-access-token';
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
  let host: string | undefined;
  let embedded: string | undefined;

  try {
    const body = bodySchema.parse(await request.json());
    shopDomain = extractShopDomain(request, body.shopDomain);
    host = body.host;
    embedded = body.embedded;

    const result = await runPlanSubscribe({
      shopDomain,
      planKey: body.planKey,
      tierId: body.tierId,
      host,
      embedded,
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
    const needsReauth = Boolean(shopDomain && isBillingReauthRequired(error));
    const reauthorizeUrl = needsReauth
      ? buildShopifyReauthorizeUrl(shopDomain!, { host, embedded })
      : null;

    return NextResponse.json(
      {
        ok: false,
        error: needsReauth
          ? 'Your Shopify session expired. Open Push Eagle from Shopify admin to reconnect, then try again.'
          : message,
        reauthorizeUrl,
        diagnosticsPath: '/diagnostics/shopify-billing',
      },
      { status: needsReauth ? 401 : 400 },
    );
  }
}
