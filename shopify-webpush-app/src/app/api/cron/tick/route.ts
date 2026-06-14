import { NextResponse } from 'next/server';

import { isCronAuthorized, parseCronTickConfig } from '@/lib/server/cron/auth';
import { readCronSleepUntil } from '@/lib/server/cron/cron-idle';
import { runCronTick } from '@/lib/server/cron/run-cron-tick';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized cron request.' }, { status: 401 });
    }

    const sleepUntil = await readCronSleepUntil();
    if (sleepUntil && sleepUntil.getTime() > Date.now()) {
      return NextResponse.json({
        ok: true,
        idle: true,
        source: 'kv-sleep',
        sleepUntil: sleepUntil.toISOString(),
      });
    }

    const url = new URL(request.url);
    const config = parseCronTickConfig(url.searchParams);
    const workerId = request.headers.get('x-worker-id') ?? 'cron-tick';

    const payload = await runCronTick(config, workerId);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to run cron tick.';
    console.error('[cron-tick]', message, error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
