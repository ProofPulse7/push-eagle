import { env } from '@/lib/config/env';

export const MAX_AUTOMATION_QUEUE_DELAY_SECONDS = 43_200;

export const isAutomationQueueEnabled = () =>
  env.AUTOMATION_QUEUE_ENABLED && Boolean(env.CLOUDFLARE_WORKER_URL.trim());

const getWorkerUrl = () => env.CLOUDFLARE_WORKER_URL.trim().replace(/\/$/, '');

const buildAuthHeaders = () => {
  const secret = env.CRON_SECRET.trim();
  if (!secret) {
    throw new Error('CRON_SECRET is required for automation queue scheduling.');
  }

  return {
    Authorization: `Bearer ${secret}`,
    'x-automation-secret': secret,
    'Content-Type': 'application/json',
  };
};

export const scheduleAutomationJobInQueue = async (jobId: string, dueAt: Date) => {
  if (!isAutomationQueueEnabled()) {
    return { scheduled: false as const, reason: 'disabled' as const };
  }

  const delayMs = dueAt.getTime() - Date.now();
  if (delayMs > MAX_AUTOMATION_QUEUE_DELAY_SECONDS * 1000) {
    return { scheduled: false as const, reason: 'delay_too_long' as const };
  }

  const delaySeconds = Math.max(0, Math.ceil(delayMs / 1000));
  const response = await fetch(`${getWorkerUrl()}/internal/enqueue-automation`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify({ jobId, delaySeconds }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to enqueue automation job.');
  }

  return { scheduled: true as const, delaySeconds };
};

export const rescheduleAutomationJobInQueue = async (jobId: string, dueAt: Date) => {
  const result = await scheduleAutomationJobInQueue(jobId, dueAt);
  if (result.scheduled) {
    await markAutomationJobQueued(jobId);
  }
  return result;
};

export const markAutomationJobQueued = async (jobId: string) => {
  const { isD1AutomationJobsEnabled } = await import(
    '@/lib/server/integrations/d1-automation-jobs'
  );
  if (isD1AutomationJobsEnabled()) {
    const { d1MarkQueued } = await import('@/lib/server/integrations/d1-automation-jobs');
    await d1MarkQueued(jobId);
    return;
  }

  const { getNeonSql } = await import('@/lib/integrations/database/neon');
  const sql = getNeonSql();
  await sql`
    UPDATE automation_jobs
    SET queue_enqueued_at = NOW(), updated_at = NOW()
    WHERE id = ${jobId}
  `;
};

export const clearAutomationJobQueueMarker = async (jobId: string) => {
  const { isD1AutomationJobsEnabled } = await import(
    '@/lib/server/integrations/d1-automation-jobs'
  );
  if (isD1AutomationJobsEnabled()) {
    const { d1ClearQueueMarker } = await import('@/lib/server/integrations/d1-automation-jobs');
    await d1ClearQueueMarker(jobId);
    return;
  }

  const { getNeonSql } = await import('@/lib/integrations/database/neon');
  const sql = getNeonSql();
  await sql`
    UPDATE automation_jobs
    SET queue_enqueued_at = NULL, updated_at = NOW()
    WHERE id = ${jobId}
  `;
};

export const promoteAutomationJobsToQueue = async (limit = 250) => {
  if (!isAutomationQueueEnabled()) {
    return { promoted: 0, skipped: 0 };
  }

  const { isD1AutomationJobsEnabled } = await import(
    '@/lib/server/integrations/d1-automation-jobs'
  );

  let rows: Array<{ id: string; due_at: string }>;

  if (isD1AutomationJobsEnabled()) {
    const { d1ListPromoteableJobs } = await import('@/lib/server/integrations/d1-automation-jobs');
    rows = await d1ListPromoteableJobs(limit);
  } else {
    const { getNeonSql } = await import('@/lib/integrations/database/neon');
    const sql = getNeonSql();
    const neonRows = (await sql`
      SELECT id, due_at
      FROM automation_jobs
      WHERE status = 'pending'
        AND queue_enqueued_at IS NULL
        AND due_at > NOW()
        AND due_at <= NOW() + make_interval(hours => 12)
      ORDER BY due_at ASC
      LIMIT ${limit}
    `) as Array<{ id: unknown; due_at: unknown }>;
    rows = neonRows.map((r) => ({ id: String(r.id), due_at: String(r.due_at) }));
  }

  let promoted = 0;
  let skipped = 0;

  for (const row of rows) {
    const jobId = String(row.id);
    const dueAt = new Date(String(row.due_at));
    try {
      const result = await scheduleAutomationJobInQueue(jobId, dueAt);
      if (result.scheduled) {
        await markAutomationJobQueued(jobId);
        promoted += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      skipped += 1;
      console.error('[automation-queue] promote failed', jobId, error);
    }
  }

  return { promoted, skipped };
};

export const queueAutomationJobAfterInsert = (jobId: string, dueAt: Date) => {
  void (async () => {
    try {
      const result = await scheduleAutomationJobInQueue(jobId, dueAt);
      if (result.scheduled) {
        await markAutomationJobQueued(jobId);
      }
    } catch (error) {
      console.error('[automation-queue] schedule failed', jobId, error);
    }
  })();
};

export const reconcileMissedAutomationJobs = async (limit = 100) => {
  const { isD1AutomationJobsEnabled } = await import(
    '@/lib/server/integrations/d1-automation-jobs'
  );

  let rows: Array<{ id: string; due_at: string; queue_enqueued_at: string | null }>;

  if (isD1AutomationJobsEnabled()) {
    const { d1ListMissedJobs } = await import('@/lib/server/integrations/d1-automation-jobs');
    rows = await d1ListMissedJobs(limit);
  } else {
    const { getNeonSql } = await import('@/lib/integrations/database/neon');
    const sql = getNeonSql();
    const neonRows = (await sql`
      SELECT id, due_at, queue_enqueued_at
      FROM automation_jobs
      WHERE status = 'pending'
        AND due_at <= NOW() - INTERVAL '30 seconds'
      ORDER BY due_at ASC
      LIMIT ${limit}
    `) as Array<{ id: unknown; due_at: unknown; queue_enqueued_at: unknown }>;
    rows = neonRows.map((r) => ({
      id: String(r.id),
      due_at: String(r.due_at),
      queue_enqueued_at: r.queue_enqueued_at != null ? String(r.queue_enqueued_at) : null,
    }));
  }

  if (!rows.length) {
    return { checked: 0, processed: 0, requeued: 0 };
  }

  const { processAutomationJob } = await import('@/lib/server/data/store');
  let processed = 0;
  let requeued = 0;

  for (const row of rows) {
    const jobId = String(row.id);
    const dueAt = new Date(String(row.due_at));

    if (!row.queue_enqueued_at) {
      try {
        const result = await scheduleAutomationJobInQueue(jobId, dueAt);
        if (result.scheduled) {
          await markAutomationJobQueued(jobId);
          requeued += 1;
          continue;
        }
      } catch (error) {
        console.error('[automation-queue] reconcile requeue failed', jobId, error);
      }
    }

    const result = await processAutomationJob(jobId);
    if (result.processed) {
      processed += 1;
    }
  }

  return { checked: rows.length, processed, requeued };
};
