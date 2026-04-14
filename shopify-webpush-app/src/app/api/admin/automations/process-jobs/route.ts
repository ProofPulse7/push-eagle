/**
 * Automation Job Processor API
 * Process and send pending automations
 * Can be called by cron jobs or triggered via webhook
 */

import { NextResponse } from 'next/server';
import { processAutomationJobs, getAutomationJobStats } from '@/lib/server/automation/job-processor';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes

/**
 * GET /api/admin/automations/process-jobs
 * Trigger automation job processing
 * Auth: Requires CRON_SECRET header
 */
export async function GET(request: Request) {
  const secret = request.headers.get('X-Cron-Secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processAutomationJobs({
      batchSize: 1000,
      maxConcurrent: 50,
      maxRetries: 3,
    });

    return NextResponse.json({
      ok: true,
      processed: result.totalProcessed,
      errors: result.totalErrors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process jobs';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/automations/process-jobs
 * Alternative POST endpoint for webhook triggers
 */
export async function POST(request: Request) {
  const secret = request.headers.get('X-Cron-Secret');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));

    const result = await processAutomationJobs({
      batchSize: body.batchSize || 1000,
      maxConcurrent: body.maxConcurrent || 50,
      maxRetries: body.maxRetries || 3,
    });

    return NextResponse.json({
      ok: true,
      processed: result.totalProcessed,
      errors: result.totalErrors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process jobs';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
