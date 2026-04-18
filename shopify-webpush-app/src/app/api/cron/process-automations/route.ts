import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { listDueAutomationJobs, processAutomationJob, pruneAutomationData } from '@/lib/server/data/store';

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
    const maxConcurrent = parsePositiveInt(url.searchParams.get('maxConcurrent'), 50, 1, 200);
    const workerId = request.headers.get('x-worker-id') ?? `worker-${shardIndex}`;

    await pruneAutomationData();

    const jobs = await listDueAutomationJobs(maxJobs, shardCount, shardIndex);
    const processed = [] as Array<{ jobId: string; processed: boolean; error?: string }>;

    for (let index = 0; index < jobs.length; index += maxConcurrent) {
      const chunk = jobs.slice(index, index + maxConcurrent);
      const results = await Promise.all(
        chunk.map(async (job) => {
          const result = await processAutomationJob(job.id);
          return { jobId: job.id, processed: Boolean(result.processed), error: result.error };
        }),
      );

      processed.push(...results);
    }

    return NextResponse.json({
      ok: true,
      workerId,
      shardCount,
      shardIndex,
      maxConcurrent,
      dueJobs: jobs.length,
      sentCount: processed.filter((item) => item.processed).length,
      skippedCount: processed.filter((item) => !item.processed && item.error && !String(item.error).toLowerCase().includes('failed')).length,
      failedCount: processed.filter((item) => !item.processed && item.error).length,
      processed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process automations.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
