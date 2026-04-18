import { NextResponse } from 'next/server';
import { getNeonSql } from '@/lib/integrations/database/neon';

export const maxDuration = 30;

/**
 * GET /api/health/system
 * 
 * Returns system health metrics:
 * - Database connectivity
 * - Last cron execution times
 * - Queue sizes
 * - Campaign/automation stats
 * - Recent errors
 */
export async function GET(request: Request) {
  try {
    const sql = getNeonSql();

    // Get timestamp
    const now = new Date();

    // Database health
    const dbHealth = await Promise.all([
      sql`SELECT 1 as health`.then(() => true).catch(() => false),
    ]).then((results) => results[0]);

    // Last cron execution (infer from recently updated campaigns/jobs)
    const lastCampaignSent = await sql`
      SELECT sent_at FROM campaigns 
      WHERE sent_at IS NOT NULL 
      ORDER BY sent_at DESC 
      LIMIT 1
    `.then((rows) => (rows[0] ? new Date(rows[0].sent_at) : null));

    const lastAutomationSent = await sql`
      SELECT sent_at FROM automation_jobs 
      WHERE status = 'sent'
      ORDER BY sent_at DESC 
      LIMIT 1
    `.then((rows) => (rows[0] ? new Date(rows[0].sent_at) : null));

    // Queue sizes
    const [dueCampaigns, dueAutomations, pendingTokens, activeSubscribers] = await Promise.all([
      sql`
        SELECT COUNT(*)::INT as count FROM campaigns 
        WHERE status IN ('draft', 'scheduled') 
        AND (scheduled_at IS NULL OR scheduled_at <= NOW())
      `.then((rows) => Number(rows[0]?.count ?? 0)),

      sql`
        SELECT COUNT(*)::INT as count FROM automation_jobs 
        WHERE status = 'pending' AND due_at <= NOW()
      `.then((rows) => Number(rows[0]?.count ?? 0)),

      sql`
        SELECT COUNT(*)::INT as count FROM subscriber_tokens 
        WHERE status = 'active'
      `.then((rows) => Number(rows[0]?.count ?? 0)),

      sql`
        SELECT COUNT(*)::INT as count FROM subscribers
      `.then((rows) => Number(rows[0]?.count ?? 0)),
    ]);

    // Recent errors
    const recentFailures = await sql`
      SELECT * FROM (
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
      ) campaign_failures
      UNION ALL
      SELECT * FROM (
        SELECT 
          'automation' as type,
          id,
          rule_key as label,
          status,
          updated_at,
          error_message
        FROM automation_jobs
        WHERE status = 'failed' AND attempts >= 3
        ORDER BY updated_at DESC
        LIMIT 5
      ) automation_failures
    `;

    // System stats
    const stats = await sql`
      SELECT
        (SELECT COUNT(*)::INT FROM campaigns WHERE status = 'sent') as campaigns_sent,
        (SELECT COUNT(*)::INT FROM campaigns WHERE status = 'draft') as campaigns_draft,
        (SELECT COUNT(*)::INT FROM campaigns WHERE status = 'scheduled') as campaigns_scheduled,
        (SELECT COUNT(*)::INT FROM automation_jobs WHERE status = 'sent') as automations_sent,
        (SELECT COUNT(*)::INT FROM automation_jobs WHERE status = 'pending') as automations_pending,
        (SELECT COUNT(*)::INT FROM automation_jobs WHERE status = 'failed') as automations_failed,
        (SELECT COALESCE(SUM(delivery_count), 0)::INT FROM campaigns) as total_deliveries,
        (SELECT COALESCE(SUM(click_count), 0)::INT FROM campaigns) as total_clicks
    `;

    const stat = stats[0];

    return NextResponse.json({
      timestamp: now.toISOString(),
      health: {
        database: dbHealth ? 'healthy' : 'unhealthy',
        cron: lastCampaignSent ? 'active' : 'pending',
      },
      lastExecution: {
        campaignsSent: lastCampaignSent?.toISOString() ?? null,
        automationsSent: lastAutomationSent?.toISOString() ?? null,
        minutesAgo: lastCampaignSent ? Math.floor((now.getTime() - lastCampaignSent.getTime()) / 60000) : null,
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
        automationsSent: Number(stat?.automations_sent ?? 0),
        automationsPending: Number(stat?.automations_pending ?? 0),
        automationsFailed: Number(stat?.automations_failed ?? 0),
        totalDeliveries: Number(stat?.total_deliveries ?? 0),
        totalClicks: Number(stat?.total_clicks ?? 0),
      },
      recentFailures: recentFailures.map((row) => ({
        type: String(row.type),
        id: String(row.id),
        label: String(row.label),
        status: String(row.status),
        updatedAt: String(row.updated_at),
        errorMessage: row.error_message ? String(row.error_message) : null,
      })),
    });
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
