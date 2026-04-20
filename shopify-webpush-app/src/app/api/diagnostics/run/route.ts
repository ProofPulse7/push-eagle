import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getStorefrontDiagnostics,
  getWelcomeAutomationDiagnostics,
  processDueAutomationJobsForShop,
} from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

const getRequestErrorMessage = (error: unknown) => {
  if (error instanceof z.ZodError) {
    return 'Missing shop context. Re-open the app from Shopify and try again.';
  }

  return error instanceof Error ? error.message : 'Failed to run diagnostics.';
};

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const processing = await processDueAutomationJobsForShop(shopDomain, 25, 5);

    const [storefront, welcome] = await Promise.all([
      getStorefrontDiagnostics(shopDomain),
      getWelcomeAutomationDiagnostics(shopDomain),
    ]);

    return NextResponse.json(
      {
        ok: true,
        shopDomain,
        checkedAt: new Date().toISOString(),
        processing,
        storefront,
        welcome,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=5, stale-while-revalidate=10',
        },
      },
    );
  } catch (error) {
    return NextResponse.json({ ok: false, error: getRequestErrorMessage(error) }, { status: 400 });
  }
}
