import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isCronAuthorized } from '@/lib/server/cron/auth';
import { processAutomationJob } from '@/lib/server/data/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

const schema = z.object({
  jobId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized cron request.' }, { status: 401 });
    }

    const body = schema.parse(await request.json());
    const result = await processAutomationJob(body.jobId);

    return NextResponse.json({
      ok: true,
      jobId: body.jobId,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process automation job.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
