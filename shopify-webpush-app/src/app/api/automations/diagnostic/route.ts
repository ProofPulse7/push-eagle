import { NextRequest, NextResponse } from 'next/server';

import { getNeonSql } from '@/lib/integrations/database/neon';

type DiagnosticIssue = {
  severity: 'error' | 'warning' | 'info';
  component: string;
  title: string;
  description: string;
  details?: Record<string, unknown>;
};

type CronJobHealth = {
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  minutesSinceLastRun: number | null;
  errorsLastHour: number;
};

type CartStepSummary = {
  pending: number;
  dueNow: number;
  sent: number;
  failed: number;
  skipped: number;
  processing: number;
  delivered: number;
  lastDeliveredAt: string | null;
};

type DiagnosticResult = {
  ok: boolean;
  checkedAt: string;
  shopDomain: string;
  issues: DiagnosticIssue[];
  automationQueueHealth: {
    pendingJobs: number;
    processingJobs: number;
    failedJobs: number;
    dueNowJobs: number;
    overdueBy5Minutes: number;
    oldestDueAt: string | null;
    oldestDueAgeMinutes: number | null;
    abandonedCartPendingJobs: number;
    abandonedCartDueNowJobs: number;
  };
  cronHealth: {
    processAutomations: CronJobHealth;
    processAbandonedCart: CronJobHealth;
    processIngestion: CronJobHealth;
    processCampaigns: CronJobHealth;
  };
  abandonedCartDiagnostics: {
    checkedAt: string;
    summary: {
      reminder1: CartStepSummary;
      reminder2: CartStepSummary;
      reminder3: CartStepSummary;
      staleProcessing: number;
    };
    stepConfig: {
      reminder1: { enabled: boolean; delayMinutes: number };
      reminder2: { enabled: boolean; delayMinutes: number };
      reminder3: { enabled: boolean; delayMinutes: number };
    };
    sendLagDiagnostics: {
      reminder1: { sampleCount: number; averageLagMinutes: number | null; maxLagMinutes: number | null };
      reminder2: { sampleCount: number; averageLagMinutes: number | null; maxLagMinutes: number | null };
      reminder3: { sampleCount: number; averageLagMinutes: number | null; maxLagMinutes: number | null };
    };
    inferredIssues: string[];
    recentFailedReasons: {
      reminder1: string[];
      reminder2: string[];
      reminder3: string[];
    };
    pendingStepDiagnostics: {
      reminder1: { dueAt: string | null; attempts: number; error: string | null; updatedAt: string | null };
      reminder2: { dueAt: string | null; attempts: number; error: string | null; updatedAt: string | null };
      reminder3: { dueAt: string | null; attempts: number; error: string | null; updatedAt: string | null };
    };
    coreSignals: {
      addToCartEventsLast2Hours: number;
      addToCartExternalIdsLast2Hours: number;
      checkoutCompleteEventsLast2Hours: number;
      cartJobsCreatedLast2Hours: number;
      cartJobsMissingStepKeyLast2Hours: number;
      addToCartExternalIdsWithDirectActiveTokenMatch: number;
      addToCartExternalIdsWithoutDirectActiveTokenMatch: number;
      cartRuleEnabled: boolean;
    };
  };
};

const toIsoOrNull = (value: unknown) => (value ? new Date(String(value)).toISOString() : null);

const toStepKey = (value: unknown): 'cart-reminder-1' | 'cart-reminder-2' | 'cart-reminder-3' | null => {
  const key = String(value ?? '');
  if (key === 'cart-reminder-1' || key === 'cart-reminder-2' || key === 'cart-reminder-3') {
    return key;
  }
  return null;
};

const summarizeLag = (samples: number[]) => {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      averageLagMinutes: null,
      maxLagMinutes: null,
    };
  }

  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const max = Math.max(...samples);

  return {
    sampleCount: samples.length,
    averageLagMinutes: Math.round(average * 100) / 100,
    maxLagMinutes: Math.round(max * 100) / 100,
  };
};

export async function GET(request: NextRequest) {
  try {
    const shopDomain = request.nextUrl.searchParams.get('shop')?.trim().toLowerCase();
    if (!shopDomain) {
      return NextResponse.json({ ok: false, error: 'Missing shop parameter.' }, { status: 400 });
    }

    const sql = getNeonSql();
    const checkedAt = new Date().toISOString();

    const [
      automationQueueRows,
      cronHeartbeatRows,
      cartJobRows,
      cartDeliveryRows,
      staleProcessingRows,
      lagRows,
      failedRows,
      cartRuleRows,
      activityRows,
      cartWindowRows,
      tokenCoverageRows,
      identityDebugRows,
      pendingCartStepRows,
    ] = await Promise.all([
      sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending_jobs,
          COUNT(*) FILTER (WHERE status = 'processing')::INT AS processing_jobs,
          COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed_jobs,
          COUNT(*) FILTER (WHERE status = 'pending' AND due_at <= NOW())::INT AS due_now_jobs,
          COUNT(*) FILTER (WHERE status = 'pending' AND due_at <= NOW() - INTERVAL '5 minutes')::INT AS overdue_by_5m,
          MIN(due_at) FILTER (WHERE status = 'pending') AS oldest_due_at,
          COUNT(*) FILTER (WHERE rule_key = 'cart_abandonment_30m' AND status = 'pending')::INT AS cart_pending_jobs,
          COUNT(*) FILTER (WHERE rule_key = 'cart_abandonment_30m' AND status = 'pending' AND due_at <= NOW())::INT AS cart_due_now_jobs
        FROM automation_jobs
        WHERE shop_domain = ${shopDomain}
      `,
      sql`
        SELECT
          job_name,
          MAX(started_at) AS last_run_at,
          MAX(completed_at) FILTER (WHERE status = 'ok') AS last_ok_at,
          MAX(completed_at) FILTER (WHERE status = 'error') AS last_error_at,
          COUNT(*) FILTER (
            WHERE status = 'error'
              AND started_at >= NOW() - INTERVAL '1 hour'
          )::INT AS errors_last_hour
        FROM cron_heartbeats
        WHERE job_name IN ('process_automations', 'process_abandoned_cart', 'process_ingestion', 'process_campaigns')
          AND started_at >= NOW() - INTERVAL '7 days'
        GROUP BY job_name
      `,
      sql`
        SELECT
          COALESCE(payload -> 'metadata' ->> 'stepKey', '') AS step_key,
          COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending,
          COUNT(*) FILTER (WHERE status = 'pending' AND due_at <= NOW())::INT AS due_now,
          COUNT(*) FILTER (WHERE status = 'sent')::INT AS sent,
          COUNT(*) FILTER (WHERE status = 'failed')::INT AS failed,
          COUNT(*) FILTER (WHERE status = 'skipped')::INT AS skipped,
          COUNT(*) FILTER (WHERE status = 'processing')::INT AS processing
        FROM automation_jobs
        WHERE shop_domain = ${shopDomain}
          AND rule_key = 'cart_abandonment_30m'
          AND COALESCE(payload -> 'metadata' ->> 'stepKey', '') IN ('cart-reminder-1', 'cart-reminder-2', 'cart-reminder-3')
        GROUP BY 1
      `,
      sql`
        SELECT
          COALESCE(j.payload -> 'metadata' ->> 'stepKey', '') AS step_key,
          COUNT(*)::INT AS delivered,
          MAX(d.delivered_at) AS last_delivered_at
        FROM automation_deliveries d
        JOIN automation_jobs j ON j.id = d.automation_job_id
        WHERE d.shop_domain = ${shopDomain}
          AND d.rule_key = 'cart_abandonment_30m'
          AND COALESCE(j.payload -> 'metadata' ->> 'stepKey', '') IN ('cart-reminder-1', 'cart-reminder-2', 'cart-reminder-3')
        GROUP BY 1
      `,
      sql`
        SELECT COUNT(*)::INT AS stale_processing
        FROM automation_jobs
        WHERE shop_domain = ${shopDomain}
          AND rule_key = 'cart_abandonment_30m'
          AND status = 'processing'
          AND updated_at < NOW() - INTERVAL '2 minutes'
          AND COALESCE(payload -> 'metadata' ->> 'stepKey', '') IN ('cart-reminder-1', 'cart-reminder-2', 'cart-reminder-3')
      `,
      sql`
        SELECT
          COALESCE(payload -> 'metadata' ->> 'stepKey', '') AS step_key,
          EXTRACT(EPOCH FROM (sent_at - due_at)) / 60.0 AS lag_minutes
        FROM automation_jobs
        WHERE shop_domain = ${shopDomain}
          AND rule_key = 'cart_abandonment_30m'
          AND status = 'sent'
          AND sent_at IS NOT NULL
          AND due_at IS NOT NULL
          AND COALESCE(payload -> 'metadata' ->> 'stepKey', '') IN ('cart-reminder-1', 'cart-reminder-2', 'cart-reminder-3')
        ORDER BY sent_at DESC
        LIMIT 120
      `,
      sql`
        SELECT
          COALESCE(payload -> 'metadata' ->> 'stepKey', '') AS step_key,
          error_message
        FROM automation_jobs
        WHERE shop_domain = ${shopDomain}
          AND rule_key = 'cart_abandonment_30m'
          AND status = 'failed'
          AND COALESCE(payload -> 'metadata' ->> 'stepKey', '') IN ('cart-reminder-1', 'cart-reminder-2', 'cart-reminder-3')
          AND COALESCE(error_message, '') <> ''
        ORDER BY updated_at DESC
        LIMIT 60
      `,
      sql`
        SELECT enabled, config
        FROM automation_rules
        WHERE shop_domain = ${shopDomain}
          AND rule_key = 'cart_abandonment_30m'
        LIMIT 1
      `,
      sql`
        SELECT
          COUNT(*) FILTER (
            WHERE event_type = 'add_to_cart'
              AND created_at >= NOW() - INTERVAL '2 hours'
          )::INT AS add_to_cart_events_2h,
          COUNT(DISTINCT external_id) FILTER (
            WHERE event_type = 'add_to_cart'
              AND created_at >= NOW() - INTERVAL '2 hours'
          )::INT AS add_to_cart_external_ids_2h,
          COUNT(*) FILTER (
            WHERE event_type = 'checkout_complete'
              AND created_at >= NOW() - INTERVAL '2 hours'
          )::INT AS checkout_complete_events_2h
        FROM subscriber_activity_events
        WHERE shop_domain = ${shopDomain}
      `,
      sql`
        SELECT
          COUNT(*) FILTER (
            WHERE rule_key = 'cart_abandonment_30m'
              AND created_at >= NOW() - INTERVAL '2 hours'
          )::INT AS cart_jobs_created_2h,
          COUNT(*) FILTER (
            WHERE rule_key = 'cart_abandonment_30m'
              AND created_at >= NOW() - INTERVAL '2 hours'
              AND COALESCE(payload -> 'metadata' ->> 'stepKey', '') = ''
          )::INT AS cart_jobs_missing_step_2h
        FROM automation_jobs
        WHERE shop_domain = ${shopDomain}
      `,
      sql`
        WITH cart_external_ids AS (
          SELECT DISTINCT external_id
          FROM subscriber_activity_events
          WHERE shop_domain = ${shopDomain}
            AND event_type = 'add_to_cart'
            AND created_at >= NOW() - INTERVAL '2 hours'
            AND external_id IS NOT NULL
            AND external_id <> ''
        ),
        matched_external_ids AS (
          SELECT c.external_id
          FROM cart_external_ids c
          JOIN subscribers s ON s.shop_domain = ${shopDomain} AND s.external_id = c.external_id
          JOIN subscriber_tokens t ON t.shop_domain = ${shopDomain} AND t.subscriber_id = s.id AND t.status = 'active'
          GROUP BY c.external_id
        )
        SELECT
          (SELECT COUNT(*)::INT FROM cart_external_ids) AS cart_external_ids,
          (SELECT COUNT(*)::INT FROM matched_external_ids) AS matched_external_ids
      `,
      sql`
        WITH recent_add_to_cart AS (
          SELECT
            external_id,
            COALESCE(cart_token, '') AS cart_token,
            COALESCE(metadata ->> 'clientId', metadata ->> 'shopifyAnalyticsClientId', '') AS client_id
          FROM subscriber_activity_events
          WHERE shop_domain = ${shopDomain}
            AND event_type = 'add_to_cart'
            AND created_at >= NOW() - INTERVAL '2 hours'
            AND external_id IS NOT NULL
            AND external_id <> ''
        ),
        external_ids AS (
          SELECT DISTINCT external_id FROM recent_add_to_cart
        )
        SELECT
          (SELECT COUNT(*)::INT FROM recent_add_to_cart WHERE cart_token <> '') AS add_to_cart_with_cart_token_2h,
          (SELECT COUNT(*)::INT FROM recent_add_to_cart WHERE client_id <> '') AS add_to_cart_with_client_id_2h,
          (SELECT COUNT(*)::INT FROM subscriber_activity_events
            WHERE shop_domain = ${shopDomain}
              AND event_type = 'add_to_cart'
              AND created_at >= NOW() - INTERVAL '2 hours'
              AND COALESCE(metadata ->> 'cartIdentitySource', '') = 'attribute'
          ) AS add_to_cart_identity_source_attribute_2h,
          (SELECT COUNT(*)::INT FROM subscriber_activity_events
            WHERE shop_domain = ${shopDomain}
              AND event_type = 'add_to_cart'
              AND created_at >= NOW() - INTERVAL '2 hours'
              AND COALESCE(metadata ->> 'cartIdentitySource', '') = 'signal'
          ) AS add_to_cart_identity_source_signal_2h,
          (SELECT COUNT(*)::INT FROM subscriber_activity_events
            WHERE shop_domain = ${shopDomain}
              AND event_type = 'add_to_cart'
              AND created_at >= NOW() - INTERVAL '2 hours'
              AND COALESCE(metadata ->> 'cartIdentitySource', '') = 'fallback_cart_token'
          ) AS add_to_cart_identity_source_fallback_2h,
          (SELECT COUNT(*)::INT FROM pixel_events
            WHERE shop_domain = ${shopDomain}
              AND event_type = 'add_to_cart'
              AND created_at >= NOW() - INTERVAL '2 hours'
          ) AS pixel_add_to_cart_events_2h,
          (SELECT COUNT(*)::INT FROM pixel_events
            WHERE shop_domain = ${shopDomain}
              AND event_type = 'add_to_cart'
              AND created_at >= NOW() - INTERVAL '2 hours'
              AND COALESCE(client_id, '') <> ''
          ) AS pixel_add_to_cart_with_client_id_2h,
          (SELECT COUNT(*)::INT FROM external_ids e
            WHERE EXISTS (
              SELECT 1
              FROM subscribers s
              JOIN subscriber_tokens t ON t.subscriber_id = s.id
              WHERE s.shop_domain = ${shopDomain}
                AND t.shop_domain = ${shopDomain}
                AND t.status = 'active'
                AND s.external_id = e.external_id
            )
          ) AS direct_external_ids_with_active_token_2h,
          (SELECT COUNT(*)::INT FROM external_ids e
            WHERE EXISTS (
              SELECT 1
              FROM recent_add_to_cart r
              JOIN subscribers s ON s.shop_domain = ${shopDomain}
              JOIN subscriber_tokens t ON t.subscriber_id = s.id
              WHERE r.external_id = e.external_id
                AND t.shop_domain = ${shopDomain}
                AND t.status = 'active'
                AND COALESCE(r.client_id, '') <> ''
                AND COALESCE(s.device_context ->> 'clientId', '') = COALESCE(r.client_id, '')
            )
          ) AS external_ids_recoverable_by_client_id_2h,
          (SELECT COUNT(*)::INT FROM external_ids e
            WHERE EXISTS (
              SELECT 1
              FROM subscriber_activity_events a
              JOIN pixel_events p ON p.shop_domain = ${shopDomain}
                AND COALESCE(p.cart_token, '') <> ''
                AND p.cart_token = a.cart_token
              JOIN subscribers s ON s.shop_domain = ${shopDomain}
              JOIN subscriber_tokens t ON t.subscriber_id = s.id
              WHERE a.shop_domain = ${shopDomain}
                AND a.event_type = 'add_to_cart'
                AND a.created_at >= NOW() - INTERVAL '2 hours'
                AND a.external_id = e.external_id
                AND t.shop_domain = ${shopDomain}
                AND t.status = 'active'
                AND (
                  COALESCE(s.device_context ->> 'clientId', '') = COALESCE(p.client_id, '')
                  OR COALESCE(s.device_context ->> 'shopifyAnalyticsClientId', '') = COALESCE(p.client_id, '')
                )
            )
          ) AS external_ids_recoverable_by_cart_token_pixel_client_id_2h,
          (SELECT created_at FROM subscriber_activity_events
            WHERE shop_domain = ${shopDomain}
              AND event_type = 'add_to_cart'
            ORDER BY created_at DESC
            LIMIT 1
          ) AS latest_add_to_cart_at,
          (SELECT COALESCE(metadata ->> 'clientId', metadata ->> 'shopifyAnalyticsClientId', '')
            FROM subscriber_activity_events
            WHERE shop_domain = ${shopDomain}
              AND event_type = 'add_to_cart'
            ORDER BY created_at DESC
            LIMIT 1
          ) AS latest_add_to_cart_client_id,
          (SELECT COALESCE(metadata ->> 'cartIdentitySource', '')
            FROM subscriber_activity_events
            WHERE shop_domain = ${shopDomain}
              AND event_type = 'add_to_cart'
            ORDER BY created_at DESC
            LIMIT 1
          ) AS latest_add_to_cart_identity_source
      `,
      sql`
        SELECT DISTINCT ON (step_key)
          step_key,
          due_at,
          attempts,
          error_message,
          updated_at
        FROM (
          SELECT
            COALESCE(payload -> 'metadata' ->> 'stepKey', '') AS step_key,
            due_at,
            attempts,
            error_message,
            updated_at
          FROM automation_jobs
          WHERE shop_domain = ${shopDomain}
            AND rule_key = 'cart_abandonment_30m'
            AND status = 'pending'
            AND COALESCE(payload -> 'metadata' ->> 'stepKey', '') IN ('cart-reminder-1', 'cart-reminder-2', 'cart-reminder-3')
        ) pending_steps
        ORDER BY step_key, due_at ASC NULLS LAST, updated_at DESC
      `,
    ]);

    const queueRow = automationQueueRows[0] as Record<string, unknown> | undefined;
    const automationQueueHealth: DiagnosticResult['automationQueueHealth'] = {
      pendingJobs: Number(queueRow?.pending_jobs ?? 0),
      processingJobs: Number(queueRow?.processing_jobs ?? 0),
      failedJobs: Number(queueRow?.failed_jobs ?? 0),
      dueNowJobs: Number(queueRow?.due_now_jobs ?? 0),
      overdueBy5Minutes: Number(queueRow?.overdue_by_5m ?? 0),
      oldestDueAt: toIsoOrNull(queueRow?.oldest_due_at),
      oldestDueAgeMinutes: queueRow?.oldest_due_at
        ? Math.max(0, Math.floor((Date.now() - new Date(String(queueRow.oldest_due_at)).getTime()) / 60000))
        : null,
      abandonedCartPendingJobs: Number(queueRow?.cart_pending_jobs ?? 0),
      abandonedCartDueNowJobs: Number(queueRow?.cart_due_now_jobs ?? 0),
    };

    const heartbeatByJob = new Map(
      (cronHeartbeatRows as Array<Record<string, unknown>>).map((row) => [
        String(row.job_name ?? ''),
        {
          lastRunAt: toIsoOrNull(row.last_run_at),
          lastOkAt: toIsoOrNull(row.last_ok_at),
          lastErrorAt: toIsoOrNull(row.last_error_at),
          errorsLastHour: Number(row.errors_last_hour ?? 0),
        },
      ]),
    );

    const toCronHealth = (jobName: string): CronJobHealth => {
      const raw = heartbeatByJob.get(jobName) ?? {
        lastRunAt: null,
        lastOkAt: null,
        lastErrorAt: null,
        errorsLastHour: 0,
      };

      return {
        ...raw,
        minutesSinceLastRun: raw.lastRunAt
          ? Math.max(0, Math.floor((Date.now() - new Date(raw.lastRunAt).getTime()) / 60000))
          : null,
      };
    };

    const cronHealth: DiagnosticResult['cronHealth'] = {
      processAutomations: toCronHealth('process_automations'),
      processAbandonedCart: toCronHealth('process_abandoned_cart'),
      processIngestion: toCronHealth('process_ingestion'),
      processCampaigns: toCronHealth('process_campaigns'),
    };

    const baseStepSummary = (): CartStepSummary => ({
      pending: 0,
      dueNow: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      processing: 0,
      delivered: 0,
      lastDeliveredAt: null,
    });

    const summary: DiagnosticResult['abandonedCartDiagnostics']['summary'] = {
      reminder1: baseStepSummary(),
      reminder2: baseStepSummary(),
      reminder3: baseStepSummary(),
      staleProcessing: Number(staleProcessingRows[0]?.stale_processing ?? 0),
    };

    for (const row of cartJobRows as Array<Record<string, unknown>>) {
      const stepKey = toStepKey(row.step_key);
      if (!stepKey) {
        continue;
      }

      const bucket = stepKey === 'cart-reminder-1'
        ? summary.reminder1
        : stepKey === 'cart-reminder-2'
          ? summary.reminder2
          : summary.reminder3;

      bucket.pending = Number(row.pending ?? 0);
      bucket.dueNow = Number(row.due_now ?? 0);
      bucket.sent = Number(row.sent ?? 0);
      bucket.failed = Number(row.failed ?? 0);
      bucket.skipped = Number(row.skipped ?? 0);
      bucket.processing = Number(row.processing ?? 0);
    }

    for (const row of cartDeliveryRows as Array<Record<string, unknown>>) {
      const stepKey = toStepKey(row.step_key);
      if (!stepKey) {
        continue;
      }

      const bucket = stepKey === 'cart-reminder-1'
        ? summary.reminder1
        : stepKey === 'cart-reminder-2'
          ? summary.reminder2
          : summary.reminder3;

      bucket.delivered = Number(row.delivered ?? 0);
      bucket.lastDeliveredAt = toIsoOrNull(row.last_delivered_at);
    }

    const stepConfigRaw = (cartRuleRows[0]?.config as Record<string, unknown> | null)?.steps as
      | Record<string, { enabled?: boolean; delayMinutes?: number }>
      | undefined;
    const cartRuleEnabled = Boolean(cartRuleRows[0]?.enabled);

    const stepConfig: DiagnosticResult['abandonedCartDiagnostics']['stepConfig'] = {
      reminder1: {
        enabled: Boolean(stepConfigRaw?.['cart-reminder-1']?.enabled),
        delayMinutes: Number(stepConfigRaw?.['cart-reminder-1']?.delayMinutes ?? 20),
      },
      reminder2: {
        enabled: Boolean(stepConfigRaw?.['cart-reminder-2']?.enabled),
        delayMinutes: Number(stepConfigRaw?.['cart-reminder-2']?.delayMinutes ?? 120),
      },
      reminder3: {
        enabled: Boolean(stepConfigRaw?.['cart-reminder-3']?.enabled),
        delayMinutes: Number(stepConfigRaw?.['cart-reminder-3']?.delayMinutes ?? 1440),
      },
    };

    const lagSamples = {
      reminder1: [] as number[],
      reminder2: [] as number[],
      reminder3: [] as number[],
    };

    for (const row of lagRows as Array<Record<string, unknown>>) {
      const stepKey = toStepKey(row.step_key);
      const lag = Number(row.lag_minutes ?? 0);
      if (!stepKey || !Number.isFinite(lag)) {
        continue;
      }

      if (stepKey === 'cart-reminder-1') {
        lagSamples.reminder1.push(lag);
      } else if (stepKey === 'cart-reminder-2') {
        lagSamples.reminder2.push(lag);
      } else {
        lagSamples.reminder3.push(lag);
      }
    }

    const sendLagDiagnostics: DiagnosticResult['abandonedCartDiagnostics']['sendLagDiagnostics'] = {
      reminder1: summarizeLag(lagSamples.reminder1),
      reminder2: summarizeLag(lagSamples.reminder2),
      reminder3: summarizeLag(lagSamples.reminder3),
    };

    const failedByStep: Record<'cart-reminder-1' | 'cart-reminder-2' | 'cart-reminder-3', string[]> = {
      'cart-reminder-1': [],
      'cart-reminder-2': [],
      'cart-reminder-3': [],
    };

    for (const row of failedRows as Array<Record<string, unknown>>) {
      const stepKey = toStepKey(row.step_key);
      const message = String(row.error_message ?? '').trim();
      if (!stepKey || !message) {
        continue;
      }
      if (failedByStep[stepKey].length < 6 && !failedByStep[stepKey].includes(message)) {
        failedByStep[stepKey].push(message);
      }
    }

    const recentFailedReasons: DiagnosticResult['abandonedCartDiagnostics']['recentFailedReasons'] = {
      reminder1: failedByStep['cart-reminder-1'],
      reminder2: failedByStep['cart-reminder-2'],
      reminder3: failedByStep['cart-reminder-3'],
    };

    const pendingStepMap = new Map(
      (pendingCartStepRows as Array<Record<string, unknown>>).map((row) => [
        String(row.step_key ?? ''),
        {
          dueAt: toIsoOrNull(row.due_at),
          attempts: Number(row.attempts ?? 0),
          error: String(row.error_message ?? '').trim() || null,
          updatedAt: toIsoOrNull(row.updated_at),
        },
      ]),
    );

    const pendingStepDiagnostics: DiagnosticResult['abandonedCartDiagnostics']['pendingStepDiagnostics'] = {
      reminder1: pendingStepMap.get('cart-reminder-1') ?? { dueAt: null, attempts: 0, error: null, updatedAt: null },
      reminder2: pendingStepMap.get('cart-reminder-2') ?? { dueAt: null, attempts: 0, error: null, updatedAt: null },
      reminder3: pendingStepMap.get('cart-reminder-3') ?? { dueAt: null, attempts: 0, error: null, updatedAt: null },
    };

    const activityRow = activityRows[0] as Record<string, unknown> | undefined;
    const cartWindowRow = cartWindowRows[0] as Record<string, unknown> | undefined;
    const tokenCoverageRow = tokenCoverageRows[0] as Record<string, unknown> | undefined;
    const identityDebugRow = identityDebugRows[0] as Record<string, unknown> | undefined;

    const coreSignals: DiagnosticResult['abandonedCartDiagnostics']['coreSignals'] = {
      addToCartEventsLast2Hours: Number(activityRow?.add_to_cart_events_2h ?? 0),
      addToCartExternalIdsLast2Hours: Number(activityRow?.add_to_cart_external_ids_2h ?? 0),
      checkoutCompleteEventsLast2Hours: Number(activityRow?.checkout_complete_events_2h ?? 0),
      cartJobsCreatedLast2Hours: Number(cartWindowRow?.cart_jobs_created_2h ?? 0),
      cartJobsMissingStepKeyLast2Hours: Number(cartWindowRow?.cart_jobs_missing_step_2h ?? 0),
      addToCartExternalIdsWithDirectActiveTokenMatch: Number(tokenCoverageRow?.matched_external_ids ?? 0),
      addToCartExternalIdsWithoutDirectActiveTokenMatch: Math.max(
        0,
        Number(tokenCoverageRow?.cart_external_ids ?? 0) - Number(tokenCoverageRow?.matched_external_ids ?? 0),
      ),
      cartRuleEnabled,
    };

    const inferredIssues: string[] = [];

    const coreProblemFinder = {
      addToCartEventsWithCartTokenLast2Hours: Number(identityDebugRow?.add_to_cart_with_cart_token_2h ?? 0),
      addToCartEventsWithClientIdLast2Hours: Number(identityDebugRow?.add_to_cart_with_client_id_2h ?? 0),
      addToCartIdentitySourceAttributeLast2Hours: Number(identityDebugRow?.add_to_cart_identity_source_attribute_2h ?? 0),
      addToCartIdentitySourceSignalLast2Hours: Number(identityDebugRow?.add_to_cart_identity_source_signal_2h ?? 0),
      addToCartIdentitySourceFallbackLast2Hours: Number(identityDebugRow?.add_to_cart_identity_source_fallback_2h ?? 0),
      pixelAddToCartEventsLast2Hours: Number(identityDebugRow?.pixel_add_to_cart_events_2h ?? 0),
      pixelAddToCartWithClientIdLast2Hours: Number(identityDebugRow?.pixel_add_to_cart_with_client_id_2h ?? 0),
      directExternalIdsWithActiveTokenLast2Hours: Number(identityDebugRow?.direct_external_ids_with_active_token_2h ?? 0),
      externalIdsRecoverableByClientIdLast2Hours: Number(identityDebugRow?.external_ids_recoverable_by_client_id_2h ?? 0),
      externalIdsRecoverableByCartTokenPixelClientIdLast2Hours: Number(identityDebugRow?.external_ids_recoverable_by_cart_token_pixel_client_id_2h ?? 0),
      latestAddToCartAt: toIsoOrNull(identityDebugRow?.latest_add_to_cart_at),
      latestAddToCartHasClientId: Boolean(String(identityDebugRow?.latest_add_to_cart_client_id ?? '').trim()),
      latestAddToCartIdentitySource: String(identityDebugRow?.latest_add_to_cart_identity_source ?? '') || null,
    };

    if (!cartRuleEnabled) {
      inferredIssues.push('Abandoned-cart rule is disabled, so add_to_cart events will not create reminders.');
    }

    if (!cronHealth.processAutomations.lastRunAt) {
      inferredIssues.push('Automation cron has never run, so delayed cart reminders will wait for fallback traffic.');
    }

    if (!cronHealth.processAbandonedCart.lastRunAt) {
      inferredIssues.push('Dedicated abandoned-cart cron has not run yet; cart automation currently depends on shared automation workers.');
    }

    if (
      cartRuleEnabled
      && coreSignals.addToCartEventsLast2Hours > 0
      && coreSignals.cartJobsCreatedLast2Hours === 0
    ) {
      inferredIssues.push('Add-to-cart activity is present but no abandoned-cart jobs were created in the last 2 hours.');
    }

    if (
      coreSignals.addToCartExternalIdsLast2Hours > 0
      && coreSignals.addToCartExternalIdsWithoutDirectActiveTokenMatch > 0
    ) {
      inferredIssues.push('Some add_to_cart identities have no direct active token match; identity stitching is required for these shoppers.');
    }

    if (coreSignals.addToCartEventsLast2Hours > 0 && coreProblemFinder.addToCartEventsWithClientIdLast2Hours === 0) {
      inferredIssues.push('Core problem finder: add_to_cart events are missing clientId metadata, reducing identity stitching accuracy.');
    }

    if (coreProblemFinder.latestAddToCartAt && !coreProblemFinder.latestAddToCartHasClientId) {
      inferredIssues.push('Core problem finder: latest add_to_cart event still has no client identity metadata; post-fix storefront event path has not been observed yet.');
    }

    if (coreSignals.addToCartEventsLast2Hours > 0 && coreProblemFinder.pixelAddToCartEventsLast2Hours === 0) {
      inferredIssues.push('Core problem finder: no add_to_cart pixel events were ingested in the last 2 hours; storefront web pixel tracking is not feeding cart identity.');
    }

    if (
      coreProblemFinder.pixelAddToCartEventsLast2Hours > 0
      && coreProblemFinder.pixelAddToCartWithClientIdLast2Hours === 0
    ) {
      inferredIssues.push('Core problem finder: add_to_cart pixel events are present but missing client_id; pixel identity bridge is incomplete.');
    }

    if (coreSignals.addToCartEventsLast2Hours > 0 && coreProblemFinder.addToCartEventsWithCartTokenLast2Hours === 0) {
      inferredIssues.push('Core problem finder: add_to_cart events are missing cart_token, reducing cart-linked identity stitching.');
    }

    if (
      coreSignals.addToCartExternalIdsLast2Hours > 0
      && coreProblemFinder.directExternalIdsWithActiveTokenLast2Hours === 0
      && coreProblemFinder.externalIdsRecoverableByClientIdLast2Hours > 0
    ) {
      inferredIssues.push('Core problem finder: direct externalId matching is failing, but clientId linkage suggests subscribers are recoverable via stitched identity.');
    }

    if (coreSignals.cartJobsMissingStepKeyLast2Hours > 0) {
      inferredIssues.push('Some abandoned-cart jobs were created without a stepKey; these jobs will not be counted per reminder step.');
    }

    if ((automationQueueHealth.abandonedCartDueNowJobs ?? 0) > 0) {
      inferredIssues.push('Due abandoned-cart jobs exist and should be picked immediately by process_automations.');
    }

    if ((summary.staleProcessing ?? 0) > 0) {
      inferredIssues.push('Stale cart processing jobs detected (>2m); worker interruption/backpressure likely occurred.');
    }

    const cartFailedTotal = summary.reminder1.failed + summary.reminder2.failed + summary.reminder3.failed;
    if (cartFailedTotal > 0) {
      inferredIssues.push('Some cart reminder jobs are failing; review recent failed reasons per step.');
    }

    if (pendingStepDiagnostics.reminder1.error) {
      inferredIssues.push(`Reminder-1 pending reason: ${pendingStepDiagnostics.reminder1.error}`);
    }

    const delayedR2 = lagSamples.reminder2.filter((value) => value >= 2).length;
    const delayedR3 = lagSamples.reminder3.filter((value) => value >= 2).length;
    if (delayedR2 > 0 || delayedR3 > 0) {
      inferredIssues.push(
        `Observed delayed sends: cart-reminder-2 delayed >=2m ${delayedR2} times, cart-reminder-3 delayed >=2m ${delayedR3} times.`,
      );
    }

    if (inferredIssues.length === 0) {
      inferredIssues.push('Abandoned-cart automation looks healthy: queue, scheduling, and send lag are within expected bounds.');
    }

    const abandonedCartDiagnostics: DiagnosticResult['abandonedCartDiagnostics'] = {
      checkedAt,
      summary,
      stepConfig,
      sendLagDiagnostics,
      inferredIssues,
      recentFailedReasons,
      pendingStepDiagnostics,
      coreSignals,
    };

    const issues: DiagnosticIssue[] = [];

    if (!cronHealth.processAutomations.lastRunAt) {
      issues.push({
        severity: 'error',
        component: 'AutomationCron',
        title: 'Automation cron has never run',
        description: 'No process_automations heartbeat was found. Delayed cart reminders may wait for fallback traffic.',
        details: cronHealth.processAutomations,
      });
    } else if ((cronHealth.processAutomations.minutesSinceLastRun ?? 9999) > 3) {
      issues.push({
        severity: 'warning',
        component: 'AutomationCron',
        title: 'Automation cron heartbeat is stale',
        description: 'process_automations has not run recently enough for timely cart reminder processing.',
        details: cronHealth.processAutomations,
      });
    } else {
      issues.push({
        severity: 'info',
        component: 'AutomationCron',
        title: 'Automation cron heartbeat is healthy',
        description: 'process_automations is running within expected cadence.',
        details: cronHealth.processAutomations,
      });
    }

    if (!cronHealth.processAbandonedCart.lastRunAt) {
      issues.push({
        severity: 'warning',
        component: 'AbandonedCartCron',
        title: 'Dedicated abandoned-cart cron is not running yet',
        description: 'Cart reminders are currently processed only by shared automation workers.',
        details: cronHealth.processAbandonedCart,
      });
    } else if ((cronHealth.processAbandonedCart.minutesSinceLastRun ?? 9999) > 3) {
      issues.push({
        severity: 'warning',
        component: 'AbandonedCartCron',
        title: 'Dedicated abandoned-cart cron heartbeat is stale',
        description: 'Cart-only worker has not run recently enough for timely cart reminder processing.',
        details: cronHealth.processAbandonedCart,
      });
    } else {
      issues.push({
        severity: 'info',
        component: 'AbandonedCartCron',
        title: 'Dedicated abandoned-cart cron heartbeat is healthy',
        description: 'Cart-only worker is running within expected cadence.',
        details: cronHealth.processAbandonedCart,
      });
    }

    if (cartRuleEnabled && coreSignals.addToCartEventsLast2Hours > 0 && coreSignals.cartJobsCreatedLast2Hours === 0) {
      issues.push({
        severity: 'error',
        component: 'AbandonedCartEnqueue',
        title: 'Add-to-cart events are not turning into cart reminder jobs',
        description: 'Core enqueue path issue: activity exists but abandoned-cart jobs were not created.',
        details: {
          ...coreSignals,
          coreProblemFinder,
        },
      });
    }

    if ((automationQueueHealth.overdueBy5Minutes ?? 0) > 0 || (automationQueueHealth.abandonedCartDueNowJobs ?? 0) > 0) {
      issues.push({
        severity: 'warning',
        component: 'AbandonedCartQueue',
        title: 'Abandoned-cart jobs are waiting in queue',
        description: 'Pending due jobs are present; verify scheduler cadence and worker throughput.',
        details: automationQueueHealth,
      });
    } else {
      issues.push({
        severity: 'info',
        component: 'AbandonedCartQueue',
        title: 'Abandoned-cart queue is healthy',
        description: 'No overdue pending abandoned-cart jobs are currently detected.',
        details: automationQueueHealth,
      });
    }

    if (cartFailedTotal > 0 || summary.staleProcessing > 0) {
      issues.push({
        severity: 'warning',
        component: 'AbandonedCartAutomation',
        title: 'Abandoned-cart diagnostics found reliability issues',
        description: 'Failed or stale abandoned-cart jobs were detected in recent data.',
        details: abandonedCartDiagnostics,
      });
    } else {
      issues.push({
        severity: 'info',
        component: 'AbandonedCartAutomation',
        title: 'Abandoned-cart automation is working as expected',
        description: 'No failure/staleness signal was detected for the abandoned-cart flow.',
        details: abandonedCartDiagnostics,
      });
    }

    return NextResponse.json({
      ok: issues.every((issue) => issue.severity !== 'error'),
      checkedAt,
      shopDomain,
      issues,
      automationQueueHealth,
      cronHealth,
      abandonedCartDiagnostics,
    } satisfies DiagnosticResult);
  } catch (error) {
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
            description: error instanceof Error ? error.message : 'Failed to run diagnostics.',
          },
        ],
        automationQueueHealth: {
          pendingJobs: 0,
          processingJobs: 0,
          failedJobs: 0,
          dueNowJobs: 0,
          overdueBy5Minutes: 0,
          oldestDueAt: null,
          oldestDueAgeMinutes: null,
          abandonedCartPendingJobs: 0,
          abandonedCartDueNowJobs: 0,
        },
        cronHealth: {
          processAutomations: {
            lastRunAt: null,
            lastOkAt: null,
            lastErrorAt: null,
            minutesSinceLastRun: null,
            errorsLastHour: 0,
          },
          processAbandonedCart: {
            lastRunAt: null,
            lastOkAt: null,
            lastErrorAt: null,
            minutesSinceLastRun: null,
            errorsLastHour: 0,
          },
          processIngestion: {
            lastRunAt: null,
            lastOkAt: null,
            lastErrorAt: null,
            minutesSinceLastRun: null,
            errorsLastHour: 0,
          },
          processCampaigns: {
            lastRunAt: null,
            lastOkAt: null,
            lastErrorAt: null,
            minutesSinceLastRun: null,
            errorsLastHour: 0,
          },
        },
        abandonedCartDiagnostics: {
          checkedAt: new Date().toISOString(),
          summary: {
            reminder1: {
              pending: 0,
              dueNow: 0,
              sent: 0,
              failed: 0,
              skipped: 0,
              processing: 0,
              delivered: 0,
              lastDeliveredAt: null,
            },
            reminder2: {
              pending: 0,
              dueNow: 0,
              sent: 0,
              failed: 0,
              skipped: 0,
              processing: 0,
              delivered: 0,
              lastDeliveredAt: null,
            },
            reminder3: {
              pending: 0,
              dueNow: 0,
              sent: 0,
              failed: 0,
              skipped: 0,
              processing: 0,
              delivered: 0,
              lastDeliveredAt: null,
            },
            staleProcessing: 0,
          },
          stepConfig: {
            reminder1: { enabled: false, delayMinutes: 20 },
            reminder2: { enabled: false, delayMinutes: 120 },
            reminder3: { enabled: false, delayMinutes: 1440 },
          },
          sendLagDiagnostics: {
            reminder1: { sampleCount: 0, averageLagMinutes: null, maxLagMinutes: null },
            reminder2: { sampleCount: 0, averageLagMinutes: null, maxLagMinutes: null },
            reminder3: { sampleCount: 0, averageLagMinutes: null, maxLagMinutes: null },
          },
          inferredIssues: ['Diagnostics could not be computed.'],
          recentFailedReasons: {
            reminder1: [],
            reminder2: [],
            reminder3: [],
          },
          pendingStepDiagnostics: {
            reminder1: { dueAt: null, attempts: 0, error: null, updatedAt: null },
            reminder2: { dueAt: null, attempts: 0, error: null, updatedAt: null },
            reminder3: { dueAt: null, attempts: 0, error: null, updatedAt: null },
          },
          coreSignals: {
            addToCartEventsLast2Hours: 0,
            addToCartExternalIdsLast2Hours: 0,
            checkoutCompleteEventsLast2Hours: 0,
            cartJobsCreatedLast2Hours: 0,
            cartJobsMissingStepKeyLast2Hours: 0,
            addToCartExternalIdsWithDirectActiveTokenMatch: 0,
            addToCartExternalIdsWithoutDirectActiveTokenMatch: 0,
            cartRuleEnabled: false,
          },
        },
      } satisfies DiagnosticResult,
      { status: 500 },
    );
  }
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'This diagnostics endpoint is now read-only and focused on abandoned-cart automation.',
    },
    { status: 405 },
  );
}

export async function DELETE(request: NextRequest) {
  try {
    const shopDomain = request.nextUrl.searchParams.get('shop')?.trim().toLowerCase();
    if (!shopDomain) {
      return NextResponse.json({ ok: false, error: 'Missing shop parameter.' }, { status: 400 });
    }

    const sql = getNeonSql();

    const [deletedJobsResult] = await Promise.all([
      sql`
        DELETE FROM automation_jobs
        WHERE shop_domain = ${shopDomain}
          AND rule_key = 'cart_abandonment_30m'
          AND status IN ('failed', 'skipped')
        RETURNING id
      `,
    ]);

    return NextResponse.json({
      ok: true,
      deletedJobs: Array.isArray(deletedJobsResult) ? deletedJobsResult.length : 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to clear diagnostic report.',
      },
      { status: 500 },
    );
  }
}
