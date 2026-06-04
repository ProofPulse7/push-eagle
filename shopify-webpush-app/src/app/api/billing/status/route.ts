import { NextResponse } from 'next/server';

import { getMerchantBilling } from '@/lib/server/billing/merchant-billing';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const billing = await getMerchantBilling(shopDomain, { reconcileUsage: true });
    return NextResponse.json({
      ok: true,
      billing,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load billing status.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
