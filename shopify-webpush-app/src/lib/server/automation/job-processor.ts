/**
 * Automation Job Processor
 * Handles sending notifications to queued automation jobs in batches
 * Optimized for millions of notifications
 */

import { getNeonSql } from '@/lib/integrations/database/neon';
import { getFirebaseAdminMessaging } from '@/lib/integrations/firebase/admin';
import { buildFcmDataOnlyWebPushMessage } from '@/lib/server/push/fcm-web-push-message';

type ProcessJobsOptions = {
  batchSize?: number;
  maxConcurrent?: number;
  maxRetries?: number;
};

const DEFAULT_BATCH_SIZE = 1000;
const DEFAULT_MAX_CONCURRENT = 50;
const DEFAULT_MAX_RETRIES = 3;

const normalizeTrackedLink = (value: string | null | undefined) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '/';
  }

  try {
    const parsed = new URL(raw);
    if (parsed.pathname === '/api/track/click' || parsed.pathname === '/api/track/automation-click') {
      return parsed.searchParams.get('u') || raw;
    }
  } catch {
    return raw;
  }

  return raw;
};

/**
 * Process pending automation jobs in batches
 * Handles FCM sending with retry logic and error recovery
 */
export const processAutomationJobs = async (options: ProcessJobsOptions = {}) => {
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const maxConcurrent = options.maxConcurrent || DEFAULT_MAX_CONCURRENT;
  const maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;

  // When automation_jobs live on D1, reuse the main D1-aware claim/send path.
  const { isD1AutomationJobsEnabled } = await import(
    '@/lib/server/integrations/d1-automation-jobs'
  );
  if (isD1AutomationJobsEnabled()) {
    const { listDueAutomationJobs, processAutomationJob } = await import(
      '@/lib/server/data/store'
    );
    let totalProcessed = 0;
    let totalErrors = 0;
    while (true) {
      const jobs = await listDueAutomationJobs(batchSize);
      if (!jobs.length) break;
      for (let i = 0; i < jobs.length; i += maxConcurrent) {
        const chunk = jobs.slice(i, i + maxConcurrent);
        const results = await Promise.all(
          chunk.map(async (job) => {
            try {
              const result = await processAutomationJob(String(job.id));
              return result.processed ? 'ok' : 'err';
            } catch {
              return 'err';
            }
          }),
        );
        totalProcessed += results.filter((r) => r === 'ok').length;
        totalErrors += results.filter((r) => r === 'err').length;
      }
      if (jobs.length < batchSize) break;
    }
    return { processed: totalProcessed, errors: totalErrors };
  }

  const sql = getNeonSql();
  const messaging = getFirebaseAdminMessaging();
  const { isD1AudienceReadActive, d1GetFcmTokensByIds } = await import(
    '@/lib/server/integrations/d1-audience'
  );
  const readActive = isD1AudienceReadActive();

  let totalProcessed = 0;
  let totalErrors = 0;

  while (true) {
    // Fetch next batch of due jobs. In read/d1_only the token (fcm) lives in D1,
    // so pull jobs from Neon then enrich from D1, keeping only jobs that still
    // resolve to a token (mirroring the INNER JOIN on subscriber_tokens).
    let jobs: any[];
    if (readActive) {
      const jobsRaw = await sql`
        SELECT
          aj.id,
          aj.shop_domain,
          aj.rule_key,
          aj.token_id,
          aj.subscriber_id,
          aj.payload,
          aj.attempts
        FROM automation_jobs aj
        WHERE aj.status = 'pending'
          AND aj.due_at <= NOW()
          AND aj.attempts < ${maxRetries}
        ORDER BY aj.due_at ASC, aj.created_at ASC
        LIMIT ${batchSize}
      `;
      const tokenIds = jobsRaw
        .map((job) => Number(job.token_id))
        .filter((id) => Number.isFinite(id));
      const fcmMap =
        tokenIds.length > 0 ? await d1GetFcmTokensByIds(tokenIds) : new Map<number, string>();
      jobs = jobsRaw
        .map((job) => ({
          ...job,
          fcm_token: job.token_id != null ? fcmMap.get(Number(job.token_id)) ?? null : null,
          platform: null,
        }))
        .filter((job) => job.fcm_token != null);
    } else {
      jobs = await sql`
        SELECT
          aj.id,
          aj.shop_domain,
          aj.rule_key,
          aj.token_id,
          aj.subscriber_id,
          aj.payload,
          aj.attempts,
          st.fcm_token,
          s.platform
        FROM automation_jobs aj
        JOIN subscriber_tokens st ON st.id = aj.token_id
        LEFT JOIN subscribers s ON s.id = aj.subscriber_id
        WHERE aj.status = 'pending'
          AND aj.due_at <= NOW()
          AND aj.attempts < ${maxRetries}
        ORDER BY aj.due_at ASC, aj.created_at ASC
        LIMIT ${batchSize}
      `;
    }

    if (jobs.length === 0) {
      break;
    }

    // Process in concurrent chunks
    for (let i = 0; i < jobs.length; i += maxConcurrent) {
      const chunk = jobs.slice(i, i + maxConcurrent);
      const promises = chunk.map((job) => sendJobNotification(job, messaging, sql, maxRetries));
      const results = await Promise.allSettled(promises);

      for (const result of results) {
        if (result.status === 'rejected') {
          totalErrors++;
        } else if (result.value) {
          totalProcessed++;
        }
      }
    }
  }

  return { totalProcessed, totalErrors };
};

/**
 * Send single notification and update job status
 */
async function sendJobNotification(
  job: any,
  messaging: any,
  sql: any,
  maxRetries: number,
): Promise<boolean> {
  try {
    const payload = job.payload as {
      title: string;
      body: string;
      targetUrl?: string | null;
      iconUrl?: string | null;
      imageUrl?: string | null;
      campaignLabel?: string | null;
      metadata?: Record<string, unknown>;
    };
    const destinationUrl = normalizeTrackedLink(payload.targetUrl);

    const fcmPayload = buildFcmDataOnlyWebPushMessage({
      token: job.fcm_token,
      title: payload.title,
      body: payload.body,
      iconUrl: payload.iconUrl,
      imageUrl: payload.imageUrl,
      linkUrl: destinationUrl,
      tag: String(job.rule_key),
      extraData: {
        ruleKey: String(job.rule_key),
        campaignLabel: payload.campaignLabel || 'automation',
        timestamp: new Date().toISOString(),
        url: destinationUrl,
      },
    });

    const response = await messaging.send(fcmPayload);

    // Mark as sent
    await sql`
      UPDATE automation_jobs
      SET
        status = 'sent',
        attempts = attempts + 1,
        sent_at = NOW(),
        updated_at = NOW()
      WHERE id = ${job.id}
    `;

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const attempts = (job.attempts || 0) + 1;

    // Update job with error
    await sql`
      UPDATE automation_jobs
      SET
        status = ${attempts >= maxRetries ? 'failed' : 'pending'},
        attempts = ${attempts},
        error_message = ${errorMessage},
        updated_at = NOW()
      WHERE id = ${job.id}
    `;

    return false;
  }
}

/**
 * Mark automation job as skipped (suppression logic)
 */
export const skipAutomationJob = async (jobId: string, skipReason: string) => {
  const { isD1AutomationJobsEnabled, d1UpdateAutomationJob } = await import(
    '@/lib/server/integrations/d1-automation-jobs'
  );
  if (isD1AutomationJobsEnabled()) {
    await d1UpdateAutomationJob(jobId, { status: 'skipped', errorMessage: skipReason });
    return;
  }

  const sql = getNeonSql();
  await sql`
    UPDATE automation_jobs
    SET
      status = 'skipped',
      error_message = ${skipReason},
      updated_at = NOW()
    WHERE id = ${jobId}
  `;
};

/**
 * Retry failed jobs with exponential backoff
 */
export const retryFailedJobs = async (maxAgeHours = 24) => {
  const { isD1AutomationJobsEnabled, d1RetryFailedJobs } = await import(
    '@/lib/server/integrations/d1-automation-jobs'
  );
  if (isD1AutomationJobsEnabled()) {
    return d1RetryFailedJobs(maxAgeHours);
  }

  const sql = getNeonSql();
  const count = (await sql`
    UPDATE automation_jobs
    SET
      status = 'pending',
      attempts = 0,
      error_message = NULL,
      due_at = NOW() + INTERVAL '5 minutes',
      updated_at = NOW()
    WHERE status = 'failed'
      AND updated_at > NOW() - make_interval(hours => ${maxAgeHours})
    RETURNING id
  `) as unknown as Array<{ id: unknown }>;

  return count.length;
};

/**
 * Get automation job stats
 */
export const getAutomationJobStats = async (shopDomain: string) => {
  const { isD1AutomationJobsEnabled, d1CountJobsByStatus } = await import(
    '@/lib/server/integrations/d1-automation-jobs'
  );
  if (isD1AutomationJobsEnabled()) {
    const byStatus = await d1CountJobsByStatus(shopDomain);
    const acc: Record<string, { count: number; withRetries: number }> = {};
    for (const [status, count] of Object.entries(byStatus)) {
      acc[status] = { count, withRetries: 0 };
    }
    return acc;
  }

  const sql = getNeonSql();
  const stats = (await sql`
    SELECT
      status,
      COUNT(*) as count,
      COUNT(CASE WHEN attempts > 0 THEN 1 END) as with_retries
    FROM automation_jobs
    WHERE shop_domain = ${shopDomain}
    GROUP BY status
  `) as unknown as Array<{ status: unknown; count: unknown; with_retries: unknown }>;

  return stats.reduce((acc: Record<string, any>, row: any) => {
    acc[String(row.status)] = {
      count: Number(row.count),
      withRetries: Number(row.with_retries),
    };
    return acc;
  }, {});
};
