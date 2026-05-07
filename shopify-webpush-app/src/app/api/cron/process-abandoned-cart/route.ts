import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import {
  completeCronHeartbeat,
  listDueAutomationJobsByRule,
  processAutomationJob,
  startCronHeartbeat,
} from '@/lib/server/data/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

const isAuthorized = (request: Request) => {
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
    const shardCount = parsePositiveInt(url.searchParams.get('shardCount'), 2, 1, 128);
    const shardIndex = parsePositiveInt(url.searchParams.get('shardIndex'), 0, 0, shardCount - 1);
    const maxJobs = parsePositiveInt(url.searchParams.get('maxJobs'), 200, 1, 2000);
    const maxConcurrent = parsePositiveInt(url.searchParams.get('maxConcurrent'), 80, 1, 200);
    const workerId = request.headers.get('x-worker-id') ?? `cart-worker-${shardIndex}`;

    heartbeatId = await startCronHeartbeat('process_abandoned_cart', {
      shardCount,
      shardIndex,
      maxJobs,
      maxConcurrent,
      workerId,
    });

    const jobs = await listDueAutomationJobsByRule('cart_abandonment_30m', maxJobs, shardCount, shardIndex);
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

    const responsePayload = {
      ok: true,
      workerId,
      ruleKey: 'cart_abandonment_30m',
      shardCount,
      shardIndex,
      maxConcurrent,
      dueJobs: jobs.length,
      sentCount: processed.filter((item) => item.processed).length,
      skippedCount: processed.filter((item) => !item.processed && item.error && !String(item.error).toLowerCase().includes('failed')).length,
      failedCount: processed.filter((item) => !item.processed && item.error).length,
      processed,
    };

    if (heartbeatId) {
      await completeCronHeartbeat({
        heartbeatId,
        ok: true,
        metadata: {
          dueJobs: jobs.length,
          sentCount: responsePayload.sentCount,
          failedCount: responsePayload.failedCount,
        },
      });
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process abandoned-cart automations.';
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
