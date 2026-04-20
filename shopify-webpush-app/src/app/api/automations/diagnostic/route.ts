import { NextRequest, NextResponse } from 'next/server';
import { getNeonSql } from '@/lib/integrations/database/neon';

type DiagnosticResult = {
  ok: boolean;
  checkedAt: string;
  shopDomain: string;
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    component: string;
    title: string;
    description: string;
    details?: Record<string, any>;
  }>;
  automationStepConfig?: Record<string, any>;
  recentAutomationJobs?: Array<{
    id: string;
    rule_key: string;
    due_at: string;
    status: string;
    payload: Record<string, any>;
  }>;
  recentSentNotifications?: Array<{
    id: string;
    sent_at: string;
    rule_key: string;
    payload: Record<string, any>;
  }>;
};

export async function GET(request: NextRequest) {
  try {
    const shopDomain = request.nextUrl.searchParams.get('shop')?.toLowerCase();
    if (!shopDomain) {
      return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
    }

    const sql = getNeonSql();
    const issues: DiagnosticResult['issues'] = [];

    // 1. Check automation step config
    let automationStepConfig: Record<string, any> = {};
    try {
      const rules = await sql`
        SELECT config
        FROM automation_rules
        WHERE shop_domain = ${shopDomain}
          AND rule_key = 'welcome_subscriber'
        LIMIT 1
      `;

      if (rules.length > 0) {
        automationStepConfig = rules[0].config || {};
        const steps = automationStepConfig.steps || {};

        // Check reminder-2 and reminder-3
        ['reminder-2', 'reminder-3'].forEach((stepId: string) => {
          const step = steps[stepId] || {};
          if (step.targetUrl && step.targetUrl.includes('/api/track')) {
            issues.push({
              severity: 'error',
              component: 'AutomationStepConfig',
              title: `${stepId} has tracking URL stored`,
              description: `The ${stepId} step has a tracking redirect URL stored instead of the merchant's direct URL.`,
              details: {
                stepId,
                storedUrl: step.targetUrl,
                shouldBe: 'merchant URL (e.g., https://store.com or /)',
              },
            });
          }
          if (step.actionButtons && Array.isArray(step.actionButtons)) {
            step.actionButtons.forEach((btn: any, idx: number) => {
              if (btn.link && btn.link.includes('/api/track')) {
                issues.push({
                  severity: 'error',
                  component: 'AutomationStepConfig',
                  title: `${stepId} button ${idx + 1} has tracking URL stored`,
                  description: `Action button has a tracking redirect URL instead of merchant's direct URL.`,
                  details: {
                    stepId,
                    buttonIndex: idx + 1,
                    storedUrl: btn.link,
                  },
                });
              }
            });
          }
        });
      } else {
        issues.push({
          severity: 'warning',
          component: 'AutomationStepConfig',
          title: 'No welcome_subscriber automation found',
          description: 'Could not find automation rule for welcome_subscriber.',
          details: { shopDomain },
        });
      }
    } catch (err) {
      issues.push({
        severity: 'error',
        component: 'AutomationStepConfig',
        title: 'Error reading automation config',
        description: String(err),
      });
    }

    // 2. Check recent automation jobs
    let recentAutomationJobs: DiagnosticResult['recentAutomationJobs'] = [];
    try {
      const jobs = await sql`
        SELECT
          id,
          rule_key,
          due_at,
          status,
          payload,
          created_at
        FROM automation_jobs
        WHERE shop_domain = ${shopDomain}
          AND rule_key = 'welcome_subscriber'
        ORDER BY created_at DESC
        LIMIT 10
      `;

      recentAutomationJobs = jobs.map((job: any) => ({
        id: job.id,
        rule_key: job.rule_key,
        due_at: job.due_at?.toISOString() || null,
        status: job.status,
        payload: job.payload,
      }));

      // Check if any have tracking URLs
      jobs.forEach((job: any) => {
        const payload = job.payload || {};
        if (payload.targetUrl && payload.targetUrl.includes('/api/track')) {
          issues.push({
            severity: 'error',
            component: 'AutomationJobs',
            title: `Queued job ${job.id.substring(0, 8)} has tracking URL payload`,
            description: `A queued automation job has a tracking redirect URL in its payload.`,
            details: {
              jobId: job.id,
              status: job.status,
              createdAt: job.created_at?.toISOString(),
              payloadUrl: payload.targetUrl,
            },
          });
        }
      });
    } catch (err) {
      issues.push({
        severity: 'error',
        component: 'AutomationJobs',
        title: 'Error reading automation jobs',
        description: String(err),
      });
    }

    // 3. Check recent sent notifications from activity log or events
    let recentSentNotifications: DiagnosticResult['recentSentNotifications'] = [];
    try {
      const events = await sql`
        SELECT
          id,
          timestamp,
          event_type,
          data
        FROM event_log
        WHERE shop_domain = ${shopDomain}
          AND event_type IN ('automation_sent', 'notification_sent')
        ORDER BY timestamp DESC
        LIMIT 20
      `;

      recentSentNotifications = events.slice(0, 5).map((evt: any) => ({
        id: evt.id,
        sent_at: evt.timestamp?.toISOString() || null,
        rule_key: evt.data?.rule_key || 'unknown',
        payload: evt.data || {},
      }));

      // Check for tracking URLs in sent notifications
      events.forEach((evt: any) => {
        const data = evt.data || {};
        if (data.url && data.url.includes('/api/track')) {
          issues.push({
            severity: 'error',
            component: 'SentNotifications',
            title: `Recently sent notification had tracking URL`,
            description: `A notification was sent with a tracking redirect URL.`,
            details: {
              timestamp: evt.timestamp?.toISOString(),
              url: data.url,
              ruleKey: data.rule_key,
            },
          });
        }
      });
    } catch (err) {
      // event_log might not exist, continue
    }

    // 4. Check for service worker issues
    try {
      const swChecks = await sql`
        SELECT
          COUNT(*) as total_tokens,
          COUNT(CASE WHEN last_service_worker_ping > NOW() - INTERVAL '24 hours' THEN 1 END) as recent_pings
        FROM subscriber_tokens
        WHERE shop_domain = ${shopDomain}
      `;

      if (swChecks[0]) {
        const { total_tokens, recent_pings } = swChecks[0];
        if (total_tokens === 0) {
          issues.push({
            severity: 'warning',
            component: 'ServiceWorker',
            title: 'No subscriber tokens registered',
            description: 'No tokens found for this store. Notifications may not be working.',
          });
        } else if (recent_pings < total_tokens * 0.5) {
          issues.push({
            severity: 'warning',
            component: 'ServiceWorker',
            title: `Only ${recent_pings}/${total_tokens} service workers active in last 24h`,
            description: 'Many service workers have not pinged recently.',
          });
        }
      }
    } catch (err) {
      // Continue
    }

    // 5. Check buildAutomationTrackedUrl logic
    issues.push({
      severity: 'info',
      component: 'URLBuilding',
      title: 'URL Building Logic Check',
      description: 'The buildAutomationTrackedUrl function should return merchant URL + ?utm_..., not /api/track/automation-click.',
      details: {
        expected: 'https://store.com/?utm_source=push_eagle&...',
        bugIndication: 'If notifications open https://push-eagle.vercel.app/api/track/automation-click, the merchant URL is being replaced with tracker URL',
      },
    });

    // 6. Check unwrapTrackingRedirectUrl
    issues.push({
      severity: 'info',
      component: 'URLUnwrapping',
      title: 'Tracking URL Unwrapper Check',
      description: 'When loading saved configs, old /api/track URLs should be unwrapped back to the merchant URL.',
      details: {
        function: 'unwrapTrackingRedirectUrl',
        shouldConvert: 'https://push-eagle.vercel.app/api/track/automation-click?u=https%3A%2F%2Fstore.com → https://store.com',
      },
    });

    return NextResponse.json({
      ok: issues.filter(i => i.severity === 'error').length === 0,
      checkedAt: new Date().toISOString(),
      shopDomain,
      issues,
      automationStepConfig,
      recentAutomationJobs,
      recentSentNotifications,
    } as DiagnosticResult);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        shopDomain: 'unknown',
        issues: [
          {
            severity: 'error',
            component: 'Diagnostic',
            title: 'Diagnostic error',
            description: String(err),
          },
        ],
      },
      { status: 500 }
    );
  }
}
