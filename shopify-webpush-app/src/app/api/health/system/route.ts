import { NextResponse } from 'next/server';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { isCronAuthorized } from '@/lib/server/cron/auth';

export const maxDuration = 30;

const HEALTH_CACHE_KV_KEY = 'pe:health:system:v1';
const HEALTH_CACHE_TTL_SECONDS = 10 * 60;

/**
 * GET /api/health/system
 *
 * Returns system health metrics (cron-authenticated).
 * Cached 10m in KV so monitors do not wake Neon on every poll.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const forceFresh = new URL(request.url).searchParams.get('fresh') === '1';

    if (!forceFresh) {
      try {
        const { isCloudflareKvEnabled, readKvJson } = await import(
          '@/lib/server/cache/cloudflare-kv'
        );
        if (isCloudflareKvEnabled()) {
          const cached = await readKvJson<{ payload: unknown; at: number }>(HEALTH_CACHE_KV_KEY);
          if (
            cached?.payload
            && typeof cached.at === 'number'
            && Date.now() - cached.at < HEALTH_CACHE_TTL_SECONDS * 1000
          ) {
            return NextResponse.json({
              ...(cached.payload as Record<string, unknown>),
              cached: true,
              cachedAt: new Date(cached.at).toISOString(),
            });
          }
        }
      } catch {
        // fall through to live query
      }
    }

    const sql = getNeonSql();
    const now = new Date();

    const dbHealth = await Promise.all([
      sql`SELECT 1 as health`.then(() => true).catch(() => false),
    ]).then((results) => results[0]);

    const lastCampaignSent = await sql`
      SELECT sent_at FROM campaigns 
      WHERE sent_at IS NOT NULL 
      ORDER BY sent_at DESC 
      LIMIT 1
    `.then((rows) => (rows[0] ? new Date(rows[0].sent_at as string) : null));

    const lastAutomationSent = await (async () => {
      const { isD1AutomationJobsEnabled, d1GlobalLastSentAt } = await import(
        '@/lib/server/integrations/d1-automation-jobs'
      );
      if (isD1AutomationJobsEnabled()) {
        const val = await d1GlobalLastSentAt();
        return val ? new Date(val) : null;
      }
      return sql`
        SELECT sent_at FROM automation_jobs
        WHERE status = 'sent'
        ORDER BY sent_at DESC
        LIMIT 1
      `.then((rows) => (rows[0] ? new Date(rows[0].sent_at as string) : null));
    })();

    const [dueCampaigns, dueAutomations, pendingTokens, activeSubscribers] = await Promise.all([
      sql`
        SELECT COUNT(*)::INT as count FROM campaigns 
        WHERE status IN ('draft', 'scheduled') 
        AND (scheduled_at IS NULL OR scheduled_at <= NOW())
      `.then((rows) => Number((rows[0] as { count?: number } | undefined)?.count ?? 0)),

      (async () => {
        const { isD1AutomationJobsEnabled, d1CountDuePendingJobs } = await import(
          '@/lib/server/integrations/d1-automation-jobs'
        );
        if (isD1AutomationJobsEnabled()) {
          return d1CountDuePendingJobs();
        }
        return sql`
          SELECT COUNT(*)::INT as count FROM automation_jobs 
          WHERE status = 'pending' AND due_at <= NOW()
        `.then((rows) => Number((rows[0] as { count?: number } | undefined)?.count ?? 0));
      })(),

      (async () => {
        const { isD1AudienceReadActive, d1CountActiveTokens } = await import(
          '@/lib/server/integrations/d1-audience'
        );
        if (isD1AudienceReadActive()) {
          return d1CountActiveTokens();
        }
        return sql`
          SELECT COUNT(*)::INT as count FROM subscriber_tokens 
          WHERE status = 'active'
        `.then((rows) => Number((rows[0] as { count?: number } | undefined)?.count ?? 0));
      })(),

      (async () => {
        const { isD1AudienceReadActive, d1CountSubscribers } = await import(
          '@/lib/server/integrations/d1-audience'
        );
        if (isD1AudienceReadActive()) {
          return d1CountSubscribers();
        }
        return sql`
          SELECT COUNT(*)::INT as count FROM subscribers
        `.then((rows) => Number((rows[0] as { count?: number } | undefined)?.count ?? 0));
      })(),
    ]);

    const { isD1AutomationJobsEnabled } = await import(
      '@/lib/server/integrations/d1-automation-jobs'
    );
    const jobsOnD1 = isD1AutomationJobsEnabled();

    const recentCampaignFailures = await sql`
      SELECT
        'campaign' as type,
        id,
        title as label,
        status,
        created_at as updated_at,
        NULL as error_message
      FROM campaigns
      WHERE status = 'failed' OR (status = 'sent' AND delivery_count = 0)
      ORDER BY created_at DESC
      LIMIT 5
    ` as Array<Record<string, unknown>>;

    const campaignStats = await sql`
      SELECT
        (SELECT COUNT(*)::INT FROM campaigns WHERE status = 'sent') as campaigns_sent,
        (SELECT COUNT(*)::INT FROM campaigns WHERE status = 'draft') as campaigns_draft,
        (SELECT COUNT(*)::INT FROM campaigns WHERE status = 'scheduled') as campaigns_scheduled,
        (SELECT COALESCE(SUM(delivery_count), 0)::INT FROM campaigns) as total_deliveries,
        (SELECT COALESCE(SUM(click_count), 0)::INT FROM campaigns) as total_clicks
    ` as Array<Record<string, unknown>>;

    let automationsSent = 0;
    let automationsPending = 0;
    let automationsFailed = 0;
    if (jobsOnD1) {
      const byStatus = await (await import('@/lib/server/integrations/d1-automation-jobs')).d1CountAllJobsByStatus();
      automationsSent = byStatus.sent ?? 0;
      automationsPending = byStatus.pending ?? 0;
      automationsFailed = byStatus.failed ?? 0;
    } else {
      const jobStats = await sql`
        SELECT
          (SELECT COUNT(*)::INT FROM automation_jobs WHERE status = 'sent') as automations_sent,
          (SELECT COUNT(*)::INT FROM automation_jobs WHERE status = 'pending') as automations_pending,
          (SELECT COUNT(*)::INT FROM automation_jobs WHERE status = 'failed') as automations_failed
      ` as Array<Record<string, unknown>>;
      automationsSent = Number(jobStats[0]?.automations_sent ?? 0);
      automationsPending = Number(jobStats[0]?.automations_pending ?? 0);
      automationsFailed = Number(jobStats[0]?.automations_failed ?? 0);
    }

    const stat = campaignStats[0];

    const payload = {
      timestamp: now.toISOString(),
      health: {
        database: dbHealth ? 'healthy' : 'unhealthy',
        cron: lastCampaignSent ? 'active' : 'pending',
        automationJobsBackend: jobsOnD1 ? 'd1' : 'neon',
      },
      lastExecution: {
        campaignsSent: lastCampaignSent?.toISOString() ?? null,
        automationsSent: lastAutomationSent?.toISOString() ?? null,
        minutesAgo: lastCampaignSent
          ? Math.floor((now.getTime() - lastCampaignSent.getTime()) / 60000)
          : null,
      },
      queues: {
        dueCampaigns,
        dueAutomations,
      },
      subscribers: {
        total: activeSubscribers,
        withActiveTokens: pendingTokens,
      },
      stats: {
        campaignsSent: Number(stat?.campaigns_sent ?? 0),
        campaignsDraft: Number(stat?.campaigns_draft ?? 0),
        campaignsScheduled: Number(stat?.campaigns_scheduled ?? 0),
        automationsSent,
        automationsPending,
        automationsFailed,
        totalDeliveries: Number(stat?.total_deliveries ?? 0),
        totalClicks: Number(stat?.total_clicks ?? 0),
      },
      recentFailures: recentCampaignFailures.map((row) => ({
        type: String(row.type),
        id: String(row.id),
        label: String(row.label),
        status: String(row.status),
        updatedAt: String(row.updated_at),
        errorMessage: row.error_message ? String(row.error_message) : null,
      })),
    };

    try {
      const { isCloudflareKvEnabled, writeKvJson } = await import(
        '@/lib/server/cache/cloudflare-kv'
      );
      if (isCloudflareKvEnabled()) {
        void writeKvJson(
          HEALTH_CACHE_KV_KEY,
          { payload, at: Date.now() },
          HEALTH_CACHE_TTL_SECONDS,
        ).catch(() => undefined);
      }
    } catch {
      // best-effort
    }

    return NextResponse.json({ ...payload, cached: false });
  } catch (error) {
    console.error('[HEALTH] System health check failed:', error);
    return NextResponse.json(
      {
        timestamp: new Date().toISOString(),
        health: { database: 'error', cron: 'unknown' },
        error: String(error),
      },
      { status: 500 },
    );
  }
}
