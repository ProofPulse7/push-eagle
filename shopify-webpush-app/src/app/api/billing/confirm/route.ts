import { NextResponse } from 'next/server';

import { confirmBillingFromShopify } from '@/lib/server/billing/sync-billing-from-shopify';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const result = await confirmBillingFromShopify(shopDomain);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to confirm subscription.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
