import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getWelcomeAutomationDiagnostics } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

const getRequestErrorMessage = (error: unknown) => {
  if (error instanceof z.ZodError) {
    return 'Missing shop context. Re-open the app from Shopify and try again.';
  }

  return error instanceof Error ? error.message : 'Failed to load welcome diagnostics.';
};

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const diagnostics = await getWelcomeAutomationDiagnostics(shopDomain);

    console.log('[welcome-diagnostics]', {
      shopDomain,
      checkedAt: diagnostics.checkedAt,
      reminder2: diagnostics.summary.reminder2,
      reminder3: diagnostics.summary.reminder3,
      staleProcessing: diagnostics.summary.staleProcessing,
      issues: diagnostics.inferredIssues,
    });

    return NextResponse.json(
      {
        ok: true,
        ...diagnostics,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=5, stale-while-revalidate=10',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getRequestErrorMessage(error) },
      { status: 400 },
    );
  }
}
