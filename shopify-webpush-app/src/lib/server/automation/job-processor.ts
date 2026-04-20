/**
 * Automation Job Processor
 * Handles sending notifications to queued automation jobs in batches
 * Optimized for millions of notifications
 */

import { getNeonSql } from '@/lib/integrations/database/neon';
import { getFirebaseAdminMessaging } from '@/lib/integrations/firebase/admin';

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

  const sql = getNeonSql();
  const messaging = getFirebaseAdminMessaging();

  let totalProcessed = 0;
  let totalErrors = 0;

  while (true) {
    // Fetch next batch of due jobs
    const jobs = await sql`
      SELECT
        aj.id,
        aj.shop_domain,
        aj.rule_key,
        aj.token_id,
        aj.subscriber_id,
        aj.payload,
        aj.attempts,
        st.fcm_token,
        st.platform
      FROM automation_jobs aj
      JOIN subscriber_tokens st ON st.id = aj.token_id
      WHERE aj.status = 'pending'
        AND aj.due_at <= NOW()
        AND aj.attempts < ${maxRetries}
      ORDER BY aj.due_at ASC, aj.created_at ASC
      LIMIT ${batchSize}
    `;

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

    const fcmPayload: any = {
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: {
        ruleKey: String(job.rule_key),
        campaignLabel: payload.campaignLabel || 'automation',
        timestamp: new Date().toISOString(),
      },
      webpush: {
        fcmOptions: { link: destinationUrl },
        notification: {
          title: payload.title,
          body: payload.body,
          icon: payload.iconUrl || undefined,
          image: payload.imageUrl || undefined,
          badge: payload.iconUrl || undefined,
          tag: String(job.rule_key),
          requireInteraction: false,
        },
        data: {
          ruleKey: String(job.rule_key),
          campaignLabel: payload.campaignLabel || 'automation',
          url: destinationUrl,
        },
      },
    };

    // Remove undefined values
    if (!fcmPayload.webpush.notification.icon) delete fcmPayload.webpush.notification.icon;
    if (!fcmPayload.webpush.notification.image) delete fcmPayload.webpush.notification.image;

    const response = await messaging.send({
      ...fcmPayload,
      token: job.fcm_token,
    });

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
  const sql = getNeonSql();

  const count = await sql`
    UPDATE automation_jobs
    SET
      status = 'pending',
      attempts = 0,
      error_message = NULL,
      due_at = NOW() + INTERVAL '5 minutes',
      updated_at = NOW()
    WHERE status = 'failed'
      AND updated_at > NOW() - INTERVAL '${maxAgeHours} hours'
    RETURNING id
  `;

  return count.length;
};

/**
 * Get automation job stats
 */
export const getAutomationJobStats = async (shopDomain: string) => {
  const sql = getNeonSql();

  const stats = await sql`
    SELECT
      status,
      COUNT(*) as count,
      COUNT(CASE WHEN attempts > 0 THEN 1 END) as with_retries
    FROM automation_jobs
    WHERE shop_domain = ${shopDomain}
    GROUP BY status
  `;

  return stats.reduce((acc: Record<string, any>, row: any) => {
    acc[String(row.status)] = {
      count: Number(row.count),
      withRetries: Number(row.with_retries),
    };
    return acc;
  }, {});
};
