import { NextResponse } from 'next/server';

import { runShopifyBillingDiagnostics } from '@/lib/server/diagnostics/shopify-billing-diagnostics';
import { resolveShopDomain } from '@/lib/server/resolve-shop';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const shopDomain = await resolveShopDomain(params);
    const report = await runShopifyBillingDiagnostics(shopDomain);

    return NextResponse.json({
      ok: report.overallStatus !== 'broken',
      report,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Diagnostics failed.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
