import { getNeonSql } from '@/lib/integrations/database/neon';
import { ensureSchema } from '@/lib/server/data/store';

export type CronWorkProbe = {
  dueScheduledCampaigns: number;
  queuedCampaigns: number;
  sendingCampaigns: number;
  dueAutomationJobs: number;
  promoteableAutomationJobs: number;
  dueIngestionJobs: number;
  nextWakeAt: Date | null;
};

export const probeCronPendingWork = async (): Promise<CronWorkProbe> => {
  await ensureSchema();
  const sql = getNeonSql();

  const rows = await sql`
    SELECT
      (
        SELECT COUNT(*)::INT
        FROM campaigns
        WHERE status = 'scheduled'
          AND scheduled_at IS NOT NULL
          AND scheduled_at <= NOW()
      ) AS due_scheduled_campaigns,
      (
        SELECT COUNT(*)::INT
        FROM campaigns
        WHERE status = 'queued'
      ) AS queued_campaigns,
      (
        SELECT COUNT(*)::INT
        FROM campaigns
        WHERE status = 'sending'
      ) AS sending_campaigns,
      (
        SELECT COUNT(*)::INT
        FROM automation_jobs
        WHERE status = 'pending'
          AND due_at <= NOW() + INTERVAL '90 seconds'
          AND (
            queue_enqueued_at IS NULL
            OR due_at <= NOW() - INTERVAL '90 seconds'
          )
      ) AS due_automation_jobs,
      (
        SELECT COUNT(*)::INT
        FROM automation_jobs
        WHERE status = 'pending'
          AND queue_enqueued_at IS NULL
          AND due_at <= NOW() + INTERVAL '12 hours'
      ) AS promoteable_automation_jobs,
      (
        SELECT COUNT(*)::INT
        FROM ingestion_jobs
        WHERE status = 'pending'
          AND due_at <= NOW()
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

export const cronProbeHasImmediateWork = (probe: CronWorkProbe) =>
  probe.dueScheduledCampaigns
  + probe.queuedCampaigns
  + probe.sendingCampaigns
  + probe.dueAutomationJobs
  + probe.dueIngestionJobs
  > 0;
