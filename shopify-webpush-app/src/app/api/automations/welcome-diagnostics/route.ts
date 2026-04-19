import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  clearWelcomeAutomationHistory,
  getWelcomeAutomationDiagnostics,
  processDueAutomationJobsForShop,
} from '@/lib/server/data/store';
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
    const processing = await processDueAutomationJobsForShop(shopDomain, 50, 10);
    const diagnostics = await getWelcomeAutomationDiagnostics(shopDomain);

    console.log('[welcome-diagnostics]', {
      shopDomain,
      checkedAt: diagnostics.checkedAt,
      processing,
      reminder2: diagnostics.summary.reminder2,
      reminder3: diagnostics.summary.reminder3,
      staleProcessing: diagnostics.summary.staleProcessing,
      issues: diagnostics.inferredIssues,
    });

    return NextResponse.json(
      {
        ok: true,
        processing,
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

export async function POST(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const cleared = await clearWelcomeAutomationHistory(shopDomain);

    return NextResponse.json({
      ok: true,
      shopDomain,
      ...cleared,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: getRequestErrorMessage(error) },
      { status: 400 },
    );
  }
}
