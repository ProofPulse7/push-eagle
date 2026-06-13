import {
  completeCronHeartbeat,
  listDueAutomationJobs,
  listDueScheduledCampaigns,
  listQueuedCampaigns,
  processAutomationJob,
  processIngestionQueue,
  runRetentionMaintenance,
  sendCampaign,
  startCronHeartbeat,
} from '@/lib/server/data/store';
import {
  isAutomationQueueEnabled,
  promoteAutomationJobsToQueue,
  reconcileMissedAutomationJobs,
} from '@/lib/server/automation/queue-scheduler';

import type { CronTickConfig } from '@/lib/server/cron/auth';

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

export const runCronTick = async (config: CronTickConfig, workerId = 'cron-tick') => {
  const heartbeatId = await startCronHeartbeat('cron_tick', {
    workerId,
    ...config,
  });

  try {
    const utcMinute = new Date().getUTCMinutes();
    const runHeavyMaintenance = utcMinute % 15 === 0;
    const runAutomationSafetyNet = !isAutomationQueueEnabled() || utcMinute % 5 === 0;

    const retention = runHeavyMaintenance ? await runRetentionMaintenance() : null;
    const queuePromotion = await promoteAutomationJobsToQueue();

    const campaignResults: Array<Record<string, unknown>> = [];
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

    const automationResults: Array<Record<string, unknown>> = [];
    if (isAutomationQueueEnabled()) {
      automationResults.push({
        mode: 'queue',
        queuePromotion,
        safetyNet: runAutomationSafetyNet
          ? await reconcileMissedAutomationJobs(config.maxAutomationJobs)
          : { skipped: true },
      });
    } else if (runAutomationSafetyNet) {
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

    const payload = {
      ok: true,
      workerId,
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

    await completeCronHeartbeat({
      heartbeatId,
      ok: true,
      metadata: {
        campaignProcessed: payload.campaigns.processedCount,
        automationDueJobs: payload.automations.dueJobs,
        automationSent: payload.automations.sentCount,
        ingestionDueJobs: payload.ingestion.dueJobs,
        ingestionProcessed: payload.ingestion.processedCount,
        retention,
      },
    });

    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cron tick failed.';
    await completeCronHeartbeat({
      heartbeatId,
      ok: false,
      errorMessage: message,
    });
    throw error;
  }
};
