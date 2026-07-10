/**
 * Reset failed automation jobs back to pending so they can be retried.
 * Auth: Requires CRON_SECRET header
 */

import { NextResponse } from 'next/server';
import { getNeonSql } from '@/lib/integrations/database/neon';

export const runtime = 'nodejs';

/**
 * POST /api/admin/automations/reset-failed
 * Body: { shop: string, ruleKey?: string }
 */
export async function POST(request: Request) {
  const secret = request.headers.get('X-Cron-Secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let shop: string;
  let ruleKey: string | undefined;
  try {
    const body = await request.json();
    shop = body.shop;
    ruleKey = body.ruleKey;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!shop) {
    return NextResponse.json({ ok: false, error: 'shop is required' }, { status: 400 });
  }

  const { isD1AutomationJobsEnabled, d1ResetFailedJobs } = await import(
    '@/lib/server/integrations/d1-automation-jobs'
  );

  if (isD1AutomationJobsEnabled()) {
    const resetCount = await d1ResetFailedJobs({ shopDomain: shop, ruleKey: ruleKey ?? null });
    return NextResponse.json({
      ok: true,
      resetCount,
      shop,
      ruleKey: ruleKey ?? 'all',
      backend: 'd1',
    });
  }

  const sql = getNeonSql();
  let rows: Array<{ id: unknown }>;

  if (ruleKey) {
    rows = (await sql`
      UPDATE automation_jobs
      SET status = 'pending', attempts = 0, error_message = NULL, updated_at = NOW()
      WHERE shop_domain = ${shop}
        AND rule_key = ${ruleKey}
        AND status = 'failed'
      RETURNING id
    `) as unknown as Array<{ id: unknown }>;
  } else {
    rows = (await sql`
      UPDATE automation_jobs
      SET status = 'pending', attempts = 0, error_message = NULL, updated_at = NOW()
      WHERE shop_domain = ${shop}
        AND status = 'failed'
      RETURNING id
    `) as unknown as Array<{ id: unknown }>;
  }

  return NextResponse.json({
    ok: true,
    resetCount: rows.length,
    shop,
    ruleKey: ruleKey ?? 'all',
    backend: 'neon',
  });
}
