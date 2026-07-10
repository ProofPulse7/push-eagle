import { getNeonSql } from '@/lib/integrations/database/neon';
import {
  isCloudflareKvEnabled,
  readKvJson,
  writeKvJson,
} from '@/lib/server/cache/cloudflare-kv';
import { isD1EventsEnabled } from '@/lib/server/integrations/d1-events';
import { isD1CommerceEnabled } from '@/lib/server/integrations/d1-commerce';
import { isD1AutomationJobsEnabled } from '@/lib/server/integrations/d1-automation-jobs';

export type CronWorkProbe = {
  dueScheduledCampaigns: number;
  queuedCampaigns: number;
  sendingCampaigns: number;
  dueAutomationJobs: number;
  promoteableAutomationJobs: number;
  dueIngestionJobs: number;
  nextWakeAt: Date | null;
};

const PROBE_CACHE_KEY = 'pe:cron:probe_idle_cache_v1';
/** Align with peekCronIdleCaches freshness window — keep Neon suspended while idle. */
const PROBE_CACHE_TTL_SECONDS = 90 * 60;

/** KV cache key for campaign-only idle state (used when D1 owns automation_jobs). */
const CAMPAIGN_IDLE_CACHE_KEY = 'pe:cron:campaign_idle_v1';
const CAMPAIGN_IDLE_TTL_SECONDS = 75 * 60;

/**
 * Prefer EXISTS (0/1) over COUNT(*) so Neon does not scan/aggregate large job tables
 * just to decide whether the cron should stay awake. Counts above 1 are unused by
 * the tick — it only checks "has work?".
 */
const readProbeFromNeon = async (): Promise<CronWorkProbe> => {
  const sql = getNeonSql();
  // When pixel + orders are ingested directly into D1, Neon ingestion_jobs stays empty.
  // Skip that subquery entirely to avoid touching the table on every probe.
  const skipIngestionProbe = isD1EventsEnabled() && isD1CommerceEnabled();

  const rows = skipIngestionProbe
    ? await sql`
      SELECT
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM campaigns
            WHERE status = 'scheduled'
              AND scheduled_at IS NOT NULL
              AND scheduled_at <= NOW()
          ) THEN 1 ELSE 0 END
        ) AS due_scheduled_campaigns,
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM campaigns WHERE status = 'queued'
          ) THEN 1 ELSE 0 END
        ) AS queued_campaigns,
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM campaigns WHERE status = 'sending'
          ) THEN 1 ELSE 0 END
        ) AS sending_campaigns,
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM automation_jobs
            WHERE status = 'pending'
              AND due_at <= NOW() + INTERVAL '90 seconds'
              AND (
                queue_enqueued_at IS NULL
                OR due_at <= NOW() - INTERVAL '90 seconds'
              )
          ) THEN 1 ELSE 0 END
        ) AS due_automation_jobs,
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM automation_jobs
            WHERE status = 'pending'
              AND queue_enqueued_at IS NULL
              AND due_at <= NOW() + INTERVAL '12 hours'
          ) THEN 1 ELSE 0 END
        ) AS promoteable_automation_jobs,
        0 AS due_ingestion_jobs,
        (
          SELECT MIN(ts)
          FROM (
            SELECT scheduled_at AS ts
            FROM campaigns
            WHERE status IN ('scheduled', 'queued')
              AND scheduled_at IS NOT NULL
              AND scheduled_at > NOW()
            UNION ALL
            SELECT due_at AS ts
            FROM automation_jobs
            WHERE status = 'pending'
              AND due_at > NOW()
          ) upcoming
        ) AS next_wake_at
    `
    : await sql`
      SELECT
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM campaigns
            WHERE status = 'scheduled'
              AND scheduled_at IS NOT NULL
              AND scheduled_at <= NOW()
          ) THEN 1 ELSE 0 END
        ) AS due_scheduled_campaigns,
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM campaigns WHERE status = 'queued'
          ) THEN 1 ELSE 0 END
        ) AS queued_campaigns,
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM campaigns WHERE status = 'sending'
          ) THEN 1 ELSE 0 END
        ) AS sending_campaigns,
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM automation_jobs
            WHERE status = 'pending'
              AND due_at <= NOW() + INTERVAL '90 seconds'
              AND (
                queue_enqueued_at IS NULL
                OR due_at <= NOW() - INTERVAL '90 seconds'
              )
          ) THEN 1 ELSE 0 END
        ) AS due_automation_jobs,
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM automation_jobs
            WHERE status = 'pending'
              AND queue_enqueued_at IS NULL
              AND due_at <= NOW() + INTERVAL '12 hours'
          ) THEN 1 ELSE 0 END
        ) AS promoteable_automation_jobs,
        (
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM ingestion_jobs
            WHERE status = 'pending'
              AND due_at <= NOW()
          ) THEN 1 ELSE 0 END
        ) AS due_ingestion_jobs,
        (
          SELECT MIN(ts)
          FROM (
            SELECT scheduled_at AS ts
            FROM campaigns
            WHERE status IN ('scheduled', 'queued')
              AND scheduled_at IS NOT NULL
              AND scheduled_at > NOW()
            UNION ALL
            SELECT due_at AS ts
            FROM automation_jobs
            WHERE status = 'pending'
              AND due_at > NOW()
            UNION ALL
            SELECT due_at AS ts
            FROM ingestion_jobs
            WHERE status = 'pending'
              AND due_at > NOW()
          ) upcoming
        ) AS next_wake_at
    `;

  const row = rows[0] as Record<string, unknown> | undefined;
  const nextWakeRaw = row?.next_wake_at;

  return {
    dueScheduledCampaigns: Number(row?.due_scheduled_campaigns ?? 0),
    queuedCampaigns: Number(row?.queued_campaigns ?? 0),
    sendingCampaigns: Number(row?.sending_campaigns ?? 0),
    dueAutomationJobs: Number(row?.due_automation_jobs ?? 0),
    promoteableAutomationJobs: Number(row?.promoteable_automation_jobs ?? 0),
    dueIngestionJobs: Number(row?.due_ingestion_jobs ?? 0),
    nextWakeAt:
      nextWakeRaw instanceof Date
        ? nextWakeRaw
        : nextWakeRaw
          ? new Date(String(nextWakeRaw))
          : null,
  };
};

/**
 * Campaign-only Neon probe (used when D1 owns automation_jobs).
 * Excludes automation_jobs subqueries to avoid touching the Neon table.
 */
const readCampaignProbeFromNeon = async (): Promise<
  Pick<CronWorkProbe, 'dueScheduledCampaigns' | 'queuedCampaigns' | 'sendingCampaigns' | 'dueIngestionJobs' | 'nextWakeAt'>
> => {
  const sql = getNeonSql();
  const skipIngestionProbe = isD1EventsEnabled() && isD1CommerceEnabled();

  const rows = skipIngestionProbe
    ? await sql`
      SELECT
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM campaigns WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()) THEN 1 ELSE 0 END) AS due_scheduled_campaigns,
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM campaigns WHERE status = 'queued') THEN 1 ELSE 0 END) AS queued_campaigns,
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM campaigns WHERE status = 'sending') THEN 1 ELSE 0 END) AS sending_campaigns,
        0 AS due_ingestion_jobs,
        (SELECT MIN(scheduled_at) FROM campaigns WHERE status IN ('scheduled', 'queued') AND scheduled_at IS NOT NULL AND scheduled_at > NOW()) AS next_wake_at
    `
    : await sql`
      SELECT
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM campaigns WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()) THEN 1 ELSE 0 END) AS due_scheduled_campaigns,
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM campaigns WHERE status = 'queued') THEN 1 ELSE 0 END) AS queued_campaigns,
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM campaigns WHERE status = 'sending') THEN 1 ELSE 0 END) AS sending_campaigns,
        (SELECT CASE WHEN EXISTS (SELECT 1 FROM ingestion_jobs WHERE status = 'pending' AND due_at <= NOW()) THEN 1 ELSE 0 END) AS due_ingestion_jobs,
        (
          SELECT MIN(ts) FROM (
            SELECT scheduled_at AS ts FROM campaigns WHERE status IN ('scheduled','queued') AND scheduled_at IS NOT NULL AND scheduled_at > NOW()
            UNION ALL
            SELECT due_at AS ts FROM ingestion_jobs WHERE status = 'pending' AND due_at > NOW()
          ) upcoming
        ) AS next_wake_at
    `;

  const row = rows[0] as Record<string, unknown> | undefined;
  const nextWakeRaw = row?.next_wake_at;
  return {
    dueScheduledCampaigns: Number(row?.due_scheduled_campaigns ?? 0),
    queuedCampaigns: Number(row?.queued_campaigns ?? 0),
    sendingCampaigns: Number(row?.sending_campaigns ?? 0),
    dueIngestionJobs: Number(row?.due_ingestion_jobs ?? 0),
    nextWakeAt:
      nextWakeRaw instanceof Date
        ? nextWakeRaw
        : nextWakeRaw
          ? new Date(String(nextWakeRaw))
          : null,
  };
};

/**
 * Invalidate the campaign idle KV cache (call whenever a campaign is scheduled/queued).
 */
export const invalidateCampaignIdleCache = async () => {
  if (!isCloudflareKvEnabled()) return;
  try {
    const { deleteKvKey } = await import('@/lib/server/cache/cloudflare-kv');
    await deleteKvKey(CAMPAIGN_IDLE_CACHE_KEY);
  } catch {
    // best-effort
  }
};

export const probeCronPendingWork = async (): Promise<CronWorkProbe> => {
  const jobsOnD1 = isD1AutomationJobsEnabled();

  if (jobsOnD1) {
    // When D1 owns jobs, probe them independently so Neon never touches automation_jobs.
    const { d1ProbeJobsWork } = await import('@/lib/server/integrations/d1-automation-jobs');

    // Check D1 jobs first (fast, no Neon).
    let jobsProbe: Awaited<ReturnType<typeof d1ProbeJobsWork>>;
    try {
      jobsProbe = await d1ProbeJobsWork();
    } catch {
      jobsProbe = { dueAutomationJobs: 0, promoteableAutomationJobs: 0, nextWakeAt: null };
    }

    const hasJobWork = jobsProbe.dueAutomationJobs > 0 || jobsProbe.promoteableAutomationJobs > 0;

    // Check KV campaign idle cache before hitting Neon.
    if (isCloudflareKvEnabled()) {
      try {
        const campaignCached = await readKvJson<{ probe: Pick<CronWorkProbe, 'dueScheduledCampaigns' | 'queuedCampaigns' | 'sendingCampaigns' | 'dueIngestionJobs' | 'nextWakeAt'>; cachedAt: number }>(CAMPAIGN_IDLE_CACHE_KEY);
        if (
          campaignCached?.probe
          && typeof campaignCached.cachedAt === 'number'
          && Date.now() - campaignCached.cachedAt < CAMPAIGN_IDLE_TTL_SECONDS * 1000
        ) {
          const campaigns = campaignCached.probe;
          const hasCampaignWork =
            campaigns.dueScheduledCampaigns + campaigns.queuedCampaigns + campaigns.sendingCampaigns + campaigns.dueIngestionJobs > 0;

          // If both D1 jobs and campaigns are idle, skip Neon entirely.
          if (!hasJobWork && !hasCampaignWork) {
          const campaignNextWakeRaw = campaigns.nextWakeAt;
          const campaignNextWake = campaignNextWakeRaw
            ? (campaignNextWakeRaw instanceof Date ? campaignNextWakeRaw : new Date(campaignNextWakeRaw as unknown as string))
            : null;
          const nextWakeAt = earlierDate(jobsProbe.nextWakeAt, campaignNextWake);
            return {
              dueScheduledCampaigns: campaigns.dueScheduledCampaigns,
              queuedCampaigns: campaigns.queuedCampaigns,
              sendingCampaigns: campaigns.sendingCampaigns,
              dueAutomationJobs: jobsProbe.dueAutomationJobs,
              promoteableAutomationJobs: jobsProbe.promoteableAutomationJobs,
              dueIngestionJobs: campaigns.dueIngestionJobs,
              nextWakeAt,
            };
          }
        }
      } catch {
        // fall through to Neon
      }
    }

    // Need fresh campaign data from Neon.
    const campaigns = await readCampaignProbeFromNeon();
    const hasCampaignWork =
      campaigns.dueScheduledCampaigns + campaigns.queuedCampaigns + campaigns.sendingCampaigns + campaigns.dueIngestionJobs > 0;

    // Cache campaign result if idle.
    if (isCloudflareKvEnabled() && !hasCampaignWork) {
      void writeKvJson(
        CAMPAIGN_IDLE_CACHE_KEY,
        { probe: campaigns, cachedAt: Date.now() },
        CAMPAIGN_IDLE_TTL_SECONDS,
      ).catch(() => undefined);
    }

    const campaignNextWake = campaigns.nextWakeAt;
    const nextWakeAt = earlierDate(jobsProbe.nextWakeAt, campaignNextWake);

    return {
      dueScheduledCampaigns: campaigns.dueScheduledCampaigns,
      queuedCampaigns: campaigns.queuedCampaigns,
      sendingCampaigns: campaigns.sendingCampaigns,
      dueAutomationJobs: jobsProbe.dueAutomationJobs,
      promoteableAutomationJobs: jobsProbe.promoteableAutomationJobs,
      dueIngestionJobs: campaigns.dueIngestionJobs,
      nextWakeAt,
    };
  }

  // Original path: all from Neon (automation_jobs included).
  if (isCloudflareKvEnabled()) {
    try {
      const cached = await readKvJson<{ probe: CronWorkProbe; cachedAt: number }>(PROBE_CACHE_KEY);
      if (
        cached?.probe
        && typeof cached.cachedAt === 'number'
        && Date.now() - cached.cachedAt < PROBE_CACHE_TTL_SECONDS * 1000
        && !cronProbeHasImmediateWork(cached.probe)
      ) {
        return cached.probe;
      }
    } catch {
      // fall through
    }
  }

  const probe = await readProbeFromNeon();

  if (isCloudflareKvEnabled() && !cronProbeHasImmediateWork(probe)) {
    void writeKvJson(
      PROBE_CACHE_KEY,
      { probe, cachedAt: Date.now() },
      PROBE_CACHE_TTL_SECONDS,
    ).catch(() => undefined);
  }

  return probe;
};

export const cronProbeHasImmediateWork = (probe: CronWorkProbe) =>
  probe.dueScheduledCampaigns
  + probe.queuedCampaigns
  + probe.sendingCampaigns
  + probe.dueAutomationJobs
  + probe.dueIngestionJobs
  > 0;

const earlierDate = (a: Date | null, b: Date | null): Date | null => {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
};
