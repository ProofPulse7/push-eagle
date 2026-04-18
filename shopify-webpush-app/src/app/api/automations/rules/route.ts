import { NextResponse } from 'next/server';
import { z } from 'zod';

import { listAutomationRules, upsertAutomationRule } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const getRequestErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof z.ZodError) {
    return 'Missing shop context. Re-open the app from Shopify and try again.';
  }

  return error instanceof Error ? error.message : fallback;
};

const updateSchema = z.object({
  shopDomain: z.string().optional(),
  ruleKey: z.enum([
    'welcome_subscriber',
    'browse_abandonment_15m',
    'cart_abandonment_30m',
    'checkout_abandonment_30m',
    'shipping_notifications',
    'back_in_stock',
    'price_drop',
    'win_back_7d',
    'post_purchase_followup',
  ]),
  enabled: z.boolean(),
  config: z.record(z.any()).optional(),
});

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const rules = await listAutomationRules(shopDomain);
    return NextResponse.json({ ok: true, rules });
  } catch (error) {
    const message = getRequestErrorMessage(error, 'Failed to load automation rules.');
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = updateSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);

    const updated = await upsertAutomationRule(shopDomain, body.ruleKey, body.enabled, body.config);
    if (!updated) {
      return NextResponse.json({ ok: false, error: 'Automation rule not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, rule: updated });
  } catch (error) {
    const message = getRequestErrorMessage(error, 'Failed to update automation rule.');
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
