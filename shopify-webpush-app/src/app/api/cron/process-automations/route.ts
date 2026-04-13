import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { listDueAutomationJobs, processAutomationJob } from '@/lib/server/data/store';

export const runtime = 'nodejs';
export const maxDuration = 300;

const isAuthorized = (request: Request) => {
  if (!env.CRON_SECRET) {
    return false;
  }

  return request.headers.get('authorization') === `Bearer ${env.CRON_SECRET}`;
};

const parsePositiveInt = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized cron request.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const shardCount = parsePositiveInt(url.searchParams.get('shardCount'), 1, 1, 128);
    const shardIndex = parsePositiveInt(url.searchParams.get('shardIndex'), 0, 0, shardCount - 1);
    const maxJobs = parsePositiveInt(url.searchParams.get('maxJobs'), 200, 1, 2000);

    const jobs = await listDueAutomationJobs(maxJobs, shardCount, shardIndex);
    const processed = [] as Array<{ jobId: string; processed: boolean; error?: string }>;

    for (const job of jobs) {
      const result = await processAutomationJob(job.id);
      processed.push({ jobId: job.id, processed: Boolean(result.processed), error: result.error });
    }

    return NextResponse.json({
      ok: true,
      shardCount,
      shardIndex,
      dueJobs: jobs.length,
      sentCount: processed.filter((item) => item.processed).length,
      failedCount: processed.filter((item) => !item.processed && item.error).length,
      processed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process automations.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
