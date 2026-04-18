import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { processIngestionQueue } from '@/lib/server/data/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

const isAuthorized = (request: Request) => {
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

    const result = await processIngestionQueue({
      shardCount,
      shardIndex,
      limit,
      maxConcurrent,
    });

    return NextResponse.json({
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process ingestion queue.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
