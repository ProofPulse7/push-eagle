import { NextResponse } from 'next/server';

import { runCampaignDeliveryDiagnostics } from '@/lib/server/diagnostics/campaign-delivery-diagnostics';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const report = await runCampaignDeliveryDiagnostics(shopDomain);

    return NextResponse.json({
      ok: true,
      shopDomain,
      report,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run campaign delivery diagnostics.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
