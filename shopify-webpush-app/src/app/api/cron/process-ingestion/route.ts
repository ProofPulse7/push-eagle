import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { completeCronHeartbeat, listDueAutomationJobs, processAutomationJob, processIngestionQueue, startCronHeartbeat } from '@/lib/server/data/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

const isAuthorized = (request: Request) => {
  // Vercel cron can arrive with varying header formats depending on platform/runtime.
  const vercelCronHeader = (request.headers.get('x-vercel-cron') ?? '').trim().toLowerCase();
  const userAgent = (request.headers.get('user-agent') ?? '').toLowerCase();
  if (vercelCronHeader === '1' || vercelCronHeader === 'true' || userAgent.includes('vercel-cron')) {
    return true;
  }

  if (!env.CRON_SECRET) {
    return false;
  }

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const xSecret = request.headers.get('x-automation-secret') ?? '';
  const querySecret = new URL(request.url).searchParams.get('secret') ?? '';
  return bearer === env.CRON_SECRET || xSecret === env.CRON_SECRET || querySecret === env.CRON_SECRET;
};

const parsePositiveInt = (value: string | null, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

export async function GET(request: Request) {
  let heartbeatId: string | null = null;
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized cron request.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const shardCount = parsePositiveInt(url.searchParams.get('shardCount'), 1, 1, 128);
    const shardIndex = parsePositiveInt(url.searchParams.get('shardIndex'), 0, 0, shardCount - 1);
    const limit = parsePositiveInt(url.searchParams.get('limit'), 500, 1, 5000);
    const maxConcurrent = parsePositiveInt(url.searchParams.get('maxConcurrent'), 50, 1, 200);
    const workerId = request.headers.get('x-worker-id') ?? `worker-${shardIndex}`;

    heartbeatId = await startCronHeartbeat('process_ingestion', {
      shardCount,
      shardIndex,
      limit,
      maxConcurrent,
      workerId,
    });

    const result = await processIngestionQueue({
      shardCount,
      shardIndex,
      limit,
      maxConcurrent,
    });

    const automationMaxJobs = parsePositiveInt(url.searchParams.get('automationMaxJobs'), 100, 0, 1000);
    const automationMaxConcurrent = parsePositiveInt(url.searchParams.get('automationMaxConcurrent'), 30, 1, 200);
    const automationJobs = automationMaxJobs > 0
      ? await listDueAutomationJobs(automationMaxJobs, shardCount, shardIndex)
      : [];
    const automationProcessed = [] as Array<{ jobId: string; processed: boolean; error?: string }>;

    for (let index = 0; index < automationJobs.length; index += automationMaxConcurrent) {
      const chunk = automationJobs.slice(index, index + automationMaxConcurrent);
      const chunkResults = await Promise.all(
        chunk.map(async (job) => {
          const processedResult = await processAutomationJob(job.id);
          return {
            jobId: job.id,
            processed: Boolean(processedResult.processed),
            error: processedResult.error,
          };
        }),
      );
      automationProcessed.push(...chunkResults);
    }

    const responsePayload = {
      ok: true,
      workerId,
      shardCount,
      shardIndex,
      limit,
      maxConcurrent,
      dueJobs: result.dueJobs,
      processedCount: result.processedCount,
      failedCount: result.failedCount,
      processed: result.processed,
      automationFallback: {
        dueJobs: automationJobs.length,
        processedCount: automationProcessed.filter((item) => item.processed).length,
        failedCount: automationProcessed.filter((item) => !item.processed && item.error).length,
      },
    };

    if (heartbeatId) {
      await completeCronHeartbeat({
        heartbeatId,
        ok: true,
        metadata: {
          ingestionDueJobs: result.dueJobs,
          ingestionProcessed: result.processedCount,
          ingestionFailed: result.failedCount,
          automationDueJobs: automationJobs.length,
          automationProcessed: responsePayload.automationFallback.processedCount,
          automationFailed: responsePayload.automationFallback.failedCount,
        },
      });
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process ingestion queue.';
    if (heartbeatId) {
      await completeCronHeartbeat({
        heartbeatId,
        ok: false,
        errorMessage: message,
      });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
