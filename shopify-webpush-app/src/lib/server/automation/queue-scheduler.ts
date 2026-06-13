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
  const { getNeonSql } = await import('@/lib/integrations/database/neon');
  const sql = getNeonSql();

  await sql`
    UPDATE automation_jobs
    SET queue_enqueued_at = NOW(), updated_at = NOW()
    WHERE id = ${jobId}
  `;
};

export const clearAutomationJobQueueMarker = async (jobId: string) => {
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

  const { getNeonSql } = await import('@/lib/integrations/database/neon');
  const sql = getNeonSql();

  const rows = await sql`
    SELECT id, due_at
    FROM automation_jobs
    WHERE status = 'pending'
      AND queue_enqueued_at IS NULL
      AND due_at > NOW()
      AND due_at <= NOW() + make_interval(hours => 12)
    ORDER BY due_at ASC
    LIMIT ${limit}
  `;

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
  const { getNeonSql } = await import('@/lib/integrations/database/neon');
  const sql = getNeonSql();

  const rows = await sql`
    SELECT id, due_at, queue_enqueued_at
    FROM automation_jobs
    WHERE status = 'pending'
      AND due_at <= NOW() - INTERVAL '2 minutes'
    ORDER BY due_at ASC
    LIMIT ${limit}
  `;

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
