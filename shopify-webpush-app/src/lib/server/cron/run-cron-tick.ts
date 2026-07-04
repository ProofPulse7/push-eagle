import {
  listDueAutomationJobs,
  listDueScheduledCampaigns,
  listQueuedCampaigns,
  processAutomationJob,
  processIngestionQueue,
  reconcileAudienceOutbox,
  runRetentionMaintenance,
  sendCampaign,
} from '@/lib/server/data/store';
import {
  isAutomationQueueEnabled,
  promoteAutomationJobsToQueue,
  reconcileMissedAutomationJobs,
} from '@/lib/server/automation/queue-scheduler';
import { clearCronSleep, writeCronSleepUntil } from '@/lib/server/cron/cron-idle';
import {
  cronProbeHasImmediateWork,
  probeCronPendingWork,
} from '@/lib/server/cron/cron-work-probe';
import { isCloudflareKvEnabled, readKvJson, writeKvJson } from '@/lib/server/cache/cloudflare-kv';

import type { CronTickConfig } from '@/lib/server/cron/auth';

const MAINTENANCE_KEY = 'pe:cron:last:maintenance';
const PROMOTION_KEY = 'pe:cron:last:promotion';
const SAFETY_NET_KEY = 'pe:cron:last:safetynet';

const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PROMOTION_INTERVAL_MS = 5 * 60 * 1000;
const QUEUE_SAFETY_NET_INTERVAL_MS = 30 * 60 * 1000;
const INLINE_AUTOMATION_INTERVAL_MS = 5 * 60 * 1000;

// Time-based scheduling (via KV markers) instead of matching an exact UTC minute:
// once the cron idles it wakes at a fixed minute each hour, which would never line
// up with a "% 30 === 0" style check. Elapsed-time markers guarantee the periodic
// safety nets still run without keeping Neon awake.
const shouldRunPeriodic = async (key: string, intervalMs: number): Promise<boolean> => {
  if (!isCloudflareKvEnabled()) {
    const minutes = Math.max(1, Math.round(intervalMs / 60000));
    return new Date().getUTCMinutes() % minutes === 0;
  }

  try {
    const last = await readKvJson<{ at?: number }>(key);
    if (last?.at && Date.now() - last.at < intervalMs) {
      return false;
    }
  } catch {
    // fall through and allow the run
  }

  return true;
};

const markPeriodicRan = (key: string, intervalMs: number) => {
  if (!isCloudflareKvEnabled()) {
    return;
  }
  const ttlSeconds = Math.max(120, Math.ceil((intervalMs * 2) / 1000));
  void writeKvJson(key, { at: Date.now() }, ttlSeconds).catch(() => undefined);
};

// Neon compute autosuspends after ~5 min idle, and every wake bills a full
// suspend cycle. Sleeping only 14 min meant the probe re-woke Neon ~100x/day,
// burning ~10 compute-hours. Since scheduling any campaign/automation calls
// bumpCronWakeNow() (which clears this sleep marker), we can idle much longer and
// still deliver on time — the cron only needs to self-wake for periodic safety nets.
const IDLE_SLEEP_MS = 60 * 60 * 1000;

const processAutomationChunk = async (
  jobs: Array<{ id: string }>,
  maxConcurrent: number,
) => {
  const processed = [] as Array<{ jobId: string; processed: boolean; error?: string }>;

  for (let index = 0; index < jobs.length; index += maxConcurrent) {
    const chunk = jobs.slice(index, index + maxConcurrent);
    const results = await Promise.all(
      chunk.map(async (job) => {
        const result = await processAutomationJob(job.id);
        return {
          jobId: job.id,
          processed: Boolean(result.processed),
          error: result.error,
        };
      }),
    );
    processed.push(...results);
  }

  return processed;
};

const resolveIdleSleepUntil = (probe: Awaited<ReturnType<typeof probeCronPendingWork>>) => {
  const cap = Date.now() + IDLE_SLEEP_MS;
  if (probe.nextWakeAt && probe.nextWakeAt.getTime() > Date.now()) {
    return new Date(Math.min(probe.nextWakeAt.getTime(), cap));
  }
  return new Date(cap);
};

export const runCronTick = async (config: CronTickConfig, workerId = 'cron-tick') => {
  const queueEnabled = isAutomationQueueEnabled();
  const [runHeavyMaintenance, runQueuePromotionDue, runAutomationSafetyNet] = await Promise.all([
    shouldRunPeriodic(MAINTENANCE_KEY, MAINTENANCE_INTERVAL_MS),
    queueEnabled ? shouldRunPeriodic(PROMOTION_KEY, PROMOTION_INTERVAL_MS) : Promise.resolve(false),
    shouldRunPeriodic(
      SAFETY_NET_KEY,
      queueEnabled ? QUEUE_SAFETY_NET_INTERVAL_MS : INLINE_AUTOMATION_INTERVAL_MS,
    ),
  ]);
  const runQueuePromotion = queueEnabled && runQueuePromotionDue;

  const probe = await probeCronPendingWork();
  const hasImmediateWork = cronProbeHasImmediateWork(probe);
  const needsPromotion = runQueuePromotion && probe.promoteableAutomationJobs > 0;

  // Zero-loss audience outbox drain: replay any buffered d1_only token writes into
  // D1. This is a cheap no-op (single SELECT returning 0 rows) when the outbox is
  // empty, so it is safe to run on every executed tick. If rows remain (e.g. D1 is
  // still degraded), we keep the tick awake so it retries every minute instead of
  // idling for the full sleep window.
  let audienceOutbox: Awaited<ReturnType<typeof reconcileAudienceOutbox>> | null = null;
  try {
    audienceOutbox = await reconcileAudienceOutbox();
  } catch (error) {
    // Assume rows remain so we stay awake and retry on the next tick.
    audienceOutbox = { processed: 0, failed: 0, remaining: 1 };
    console.error(
      '[cron] audience outbox reconcile failed',
      error instanceof Error ? error.message : error,
    );
  }
  const hasOutboxWork = Boolean(audienceOutbox && (audienceOutbox.remaining ?? 0) > 0);

  if (
    !hasImmediateWork &&
    !needsPromotion &&
    !runHeavyMaintenance &&
    !runAutomationSafetyNet &&
    !hasOutboxWork
  ) {
    const sleepUntil = resolveIdleSleepUntil(probe);
    await writeCronSleepUntil(sleepUntil);
    return {
      ok: true,
      idle: true,
      workerId,
      sleepUntil: sleepUntil.toISOString(),
      probe,
      audienceOutbox,
    };
  }

  await clearCronSleep();

  if (runHeavyMaintenance) {
    markPeriodicRan(MAINTENANCE_KEY, MAINTENANCE_INTERVAL_MS);
  }
  if (runQueuePromotion) {
    markPeriodicRan(PROMOTION_KEY, PROMOTION_INTERVAL_MS);
  }
  if (runAutomationSafetyNet) {
    markPeriodicRan(
      SAFETY_NET_KEY,
      queueEnabled ? QUEUE_SAFETY_NET_INTERVAL_MS : INLINE_AUTOMATION_INTERVAL_MS,
    );
  }

  try {
    const retention = runHeavyMaintenance ? await runRetentionMaintenance() : null;
    const queuePromotion = needsPromotion ? await promoteAutomationJobsToQueue() : { promoted: 0, skipped: 0 };

    const campaignResults: Array<Record<string, unknown>> = [];
    const hasCampaignWork =
      probe.dueScheduledCampaigns + probe.queuedCampaigns + probe.sendingCampaigns > 0;

    if (hasCampaignWork) {
      for (let shardIndex = 0; shardIndex < config.campaignShards; shardIndex += 1) {
        const dueCampaigns = await listDueScheduledCampaigns(
          config.maxCampaigns,
          config.campaignShards,
          shardIndex,
        );
        const queuedCampaigns = await listQueuedCampaigns(
          config.maxCampaigns,
          config.campaignShards,
          shardIndex,
        );
        const candidates = [...dueCampaigns, ...queuedCampaigns];
        const uniqueCandidates = Array.from(new Map(candidates.map((item) => [item.id, item])).values());

        for (const campaign of uniqueCandidates) {
          try {
            const result = await sendCampaign(campaign.shop_domain, campaign.id, {
              maxBatches: config.maxBatches,
            });
            campaignResults.push({
              campaignId: campaign.id,
              shopDomain: campaign.shop_domain,
              shardIndex,
              ...result,
            });
          } catch (error) {
            campaignResults.push({
              campaignId: campaign.id,
              shopDomain: campaign.shop_domain,
              shardIndex,
              error: error instanceof Error ? error.message : 'Failed to process campaign.',
            });
          }
        }
      }
    }

    const automationResults: Array<Record<string, unknown>> = [];
    if (isAutomationQueueEnabled()) {
      automationResults.push({
        mode: 'queue',
        queuePromotion,
        safetyNet: runAutomationSafetyNet
          ? await reconcileMissedAutomationJobs(config.maxAutomationJobs)
          : { skipped: true },
      });
    } else if (runAutomationSafetyNet && (hasImmediateWork || probe.dueAutomationJobs > 0)) {
      for (let shardIndex = 0; shardIndex < config.automationShards; shardIndex += 1) {
        const jobs = await listDueAutomationJobs(
          config.maxAutomationJobs,
          config.automationShards,
          shardIndex,
        );
        const processed = await processAutomationChunk(jobs, config.maxAutomationConcurrent);
        automationResults.push({
          mode: 'cron',
          shardIndex,
          dueJobs: jobs.length,
          sentCount: processed.filter((item) => item.processed).length,
          failedCount: processed.filter((item) => !item.processed && item.error).length,
        });
      }
    } else {
      automationResults.push({ mode: 'cron', skipped: true });
    }

    const ingestionResults: Array<Record<string, unknown>> = [];
    if (probe.dueIngestionJobs > 0) {
      for (let shardIndex = 0; shardIndex < config.ingestionShards; shardIndex += 1) {
        const result = await processIngestionQueue({
          shardCount: config.ingestionShards,
          shardIndex,
          limit: config.maxIngestionJobs,
          maxConcurrent: config.maxIngestionConcurrent,
        });
        ingestionResults.push({
          shardIndex,
          dueJobs: result.dueJobs,
          processedCount: result.processedCount,
          failedCount: result.failedCount,
        });
      }
    }

    return {
      ok: true,
      workerId,
      probe,
      audienceOutbox,
      retention,
      queuePromotion,
      campaigns: {
        shardCount: config.campaignShards,
        processedCount: campaignResults.filter((item) => !item.error).length,
        failedCount: campaignResults.filter((item) => Boolean(item.error)).length,
        items: campaignResults,
      },
      automations: {
        shardCount: config.automationShards,
        shards: automationResults,
        dueJobs: automationResults.reduce((sum, item) => sum + Number(item.dueJobs ?? 0), 0),
        sentCount: automationResults.reduce((sum, item) => sum + Number(item.sentCount ?? 0), 0),
      },
      ingestion: {
        shardCount: config.ingestionShards,
        shards: ingestionResults,
        dueJobs: ingestionResults.reduce((sum, item) => sum + Number(item.dueJobs ?? 0), 0),
        processedCount: ingestionResults.reduce((sum, item) => sum + Number(item.processedCount ?? 0), 0),
      },
    };
  } catch (error) {
    await clearCronSleep();
    throw error;
  }
};
