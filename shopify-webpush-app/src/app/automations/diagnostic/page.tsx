'use client';

import { Suspense, useEffect, useState } from 'react';

import { useSearchParams } from 'next/navigation';
import { AlertCircle, AlertTriangle, CheckCircle, Copy, Info, Loader2, RefreshCw, Trash2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSettings } from '@/context/settings-context';

type DiagnosticIssue = {
  severity: 'error' | 'warning' | 'info';
  component: string;
  title: string;
  description: string;
  details?: Record<string, unknown>;
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
    processAutomations: {
      lastRunAt: string | null;
      lastOkAt: string | null;
      lastErrorAt: string | null;
      minutesSinceLastRun: number | null;
      errorsLastHour: number;
    };
    processAbandonedCart: {
      lastRunAt: string | null;
      lastOkAt: string | null;
      lastErrorAt: string | null;
      minutesSinceLastRun: number | null;
      errorsLastHour: number;
    };
    processIngestion: {
      lastRunAt: string | null;
      lastOkAt: string | null;
      lastErrorAt: string | null;
      minutesSinceLastRun: number | null;
      errorsLastHour: number;
    };
    processCampaigns: {
      lastRunAt: string | null;
      lastOkAt: string | null;
      lastErrorAt: string | null;
      minutesSinceLastRun: number | null;
      errorsLastHour: number;
    };
  };
  abandonedCartDiagnostics: {
    checkedAt: string;
    summary: {
      reminder1: {
        pending: number;
        dueNow: number;
        sent: number;
        failed: number;
        skipped: number;
        processing: number;
        delivered: number;
        lastDeliveredAt: string | null;
      };
      reminder2: {
        pending: number;
        dueNow: number;
        sent: number;
        failed: number;
        skipped: number;
        processing: number;
        delivered: number;
        lastDeliveredAt: string | null;
      };
      reminder3: {
        pending: number;
        dueNow: number;
        sent: number;
        failed: number;
        skipped: number;
        processing: number;
        delivered: number;
        lastDeliveredAt: string | null;
      };
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

function DiagnosticPageContent() {
  const { shopDomain } = useSettings();
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || shopDomain || '';

  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clearing, setClearing] = useState(false);

  const clearDiagnostic = async () => {
    if (!shop) {
      return;
    }
    setClearing(true);
    try {
      await fetch(`/api/automations/diagnostic?shop=${encodeURIComponent(shop)}`, { method: 'DELETE' });
    } catch {
      // swallow network errors — still clear local state
    } finally {
      setClearing(false);
    }
    setDiagnostic(null);
    setError(null);
    setCopied(false);
    setLoading(false);
  };

  const fetchDiagnostic = async () => {
    if (!shop) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/automations/diagnostic?shop=${encodeURIComponent(shop)}`, { cache: 'no-store' });
      const payload = (await response.json()) as DiagnosticResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setDiagnostic(payload);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load diagnostics.');
    } finally {
      setLoading(false);
    }
  };

  const copyDiagnostic = async () => {
    if (!diagnostic) {
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Failed to copy diagnostic JSON.');
    }
  };

  useEffect(() => {
    if (shop) {
      fetchDiagnostic();
    }
  }, [shop]);

  const getSeverityIcon = (severity: DiagnosticIssue['severity']) => {
    switch (severity) {
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-amber-600" />;
      case 'info':
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const getSeverityVariant = (severity: DiagnosticIssue['severity']) => {
    switch (severity) {
      case 'error':
        return 'destructive';
      case 'warning':
        return 'secondary';
      case 'info':
        return 'outline';
    }
  };

  if (!shop) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Shop not found</AlertTitle>
          <AlertDescription>Open this page from the Shopify app so diagnostics can load for the current store.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const errorCount = diagnostic?.issues.filter((issue) => issue.severity === 'error').length ?? 0;
  const warningCount = diagnostic?.issues.filter((issue) => issue.severity === 'warning').length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Abandoned-Cart Diagnostics</h1>
          <p className="mt-2 text-sm text-muted-foreground">Focused diagnostics for abandoned-cart automation only.</p>
          <p className="mt-1 text-sm text-muted-foreground">Shop: {shop}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={fetchDiagnostic} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={clearDiagnostic} disabled={clearing || (!diagnostic && !error && !copied)}>
            {clearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            {clearing ? 'Clearing...' : 'Remove old report'}
          </Button>
          <Button size="sm" onClick={copyDiagnostic} disabled={!diagnostic}>
            <Copy className="mr-2 h-4 w-4" />
            {copied ? 'Copied' : 'Copy diagnostic JSON'}
          </Button>
        </div>
      </div>

      {!diagnostic && !loading && !error && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Report cleared</AlertTitle>
          <AlertDescription>Use Refresh after you rerun the abandoned-cart flow to generate a new diagnostic report.</AlertDescription>
        </Alert>
      )}

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Running abandoned-cart diagnostics...
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Diagnostic error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {diagnostic && !loading && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {diagnostic.ok ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
                {diagnostic.ok ? 'Abandoned-cart automation looks healthy' : 'Abandoned-cart automation issues found'}
              </CardTitle>
              <CardDescription>Last checked: {new Date(diagnostic.checkedAt).toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border p-4">
                <div className="text-2xl font-bold text-red-600">{errorCount}</div>
                <div className="text-sm text-muted-foreground">Errors</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-2xl font-bold text-amber-600">{warningCount}</div>
                <div className="text-sm text-muted-foreground">Warnings</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-2xl font-bold text-slate-900">{diagnostic.automationQueueHealth.abandonedCartPendingJobs}</div>
                <div className="text-sm text-muted-foreground">Cart pending jobs</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-2xl font-bold text-slate-900">{diagnostic.automationQueueHealth.abandonedCartDueNowJobs}</div>
                <div className="text-sm text-muted-foreground">Cart due now jobs</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Core Issues</CardTitle>
              <CardDescription>Only abandoned-cart and scheduler-related diagnostics are shown here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {diagnostic.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">No issues were inferred from current abandoned-cart signals.</p>
              ) : (
                diagnostic.issues.map((issue, index) => (
                  <div key={`${issue.component}-${index}`} className="rounded-lg border p-4">
                    <div className="flex items-start gap-3">
                      {getSeverityIcon(issue.severity)}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{issue.title}</h3>
                          <Badge variant={getSeverityVariant(issue.severity)}>{issue.severity.toUpperCase()}</Badge>
                          <Badge variant="outline">{issue.component}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{issue.description}</p>
                      </div>
                    </div>
                    {issue.details && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-medium">Show details</summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">
                          {JSON.stringify(issue.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Abandoned-Cart Step Diagnostics</CardTitle>
                <CardDescription>Per-step queue state, config, lag, and failure reasons for cart-reminder-1/2/3.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>Checked at: {new Date(diagnostic.abandonedCartDiagnostics.checkedAt).toLocaleString()}</div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <div className="font-medium">cart-reminder-1</div>
                    <div>enabled={diagnostic.abandonedCartDiagnostics.stepConfig.reminder1.enabled ? 'yes' : 'no'}</div>
                    <div>delayMinutes={diagnostic.abandonedCartDiagnostics.stepConfig.reminder1.delayMinutes}</div>
                    <div>pending={diagnostic.abandonedCartDiagnostics.summary.reminder1.pending}</div>
                    <div>dueNow={diagnostic.abandonedCartDiagnostics.summary.reminder1.dueNow}</div>
                    <div>sent={diagnostic.abandonedCartDiagnostics.summary.reminder1.sent}</div>
                    <div>failed={diagnostic.abandonedCartDiagnostics.summary.reminder1.failed}</div>
                    <div>delivered={diagnostic.abandonedCartDiagnostics.summary.reminder1.delivered}</div>
                    <div>avgLag={diagnostic.abandonedCartDiagnostics.sendLagDiagnostics.reminder1.averageLagMinutes ?? 'n/a'} min</div>
                    <div>maxLag={diagnostic.abandonedCartDiagnostics.sendLagDiagnostics.reminder1.maxLagMinutes ?? 'n/a'} min</div>
                    <div>lagSamples={diagnostic.abandonedCartDiagnostics.sendLagDiagnostics.reminder1.sampleCount}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="font-medium">cart-reminder-2</div>
                    <div>enabled={diagnostic.abandonedCartDiagnostics.stepConfig.reminder2.enabled ? 'yes' : 'no'}</div>
                    <div>delayMinutes={diagnostic.abandonedCartDiagnostics.stepConfig.reminder2.delayMinutes}</div>
                    <div>pending={diagnostic.abandonedCartDiagnostics.summary.reminder2.pending}</div>
                    <div>dueNow={diagnostic.abandonedCartDiagnostics.summary.reminder2.dueNow}</div>
                    <div>sent={diagnostic.abandonedCartDiagnostics.summary.reminder2.sent}</div>
                    <div>failed={diagnostic.abandonedCartDiagnostics.summary.reminder2.failed}</div>
                    <div>delivered={diagnostic.abandonedCartDiagnostics.summary.reminder2.delivered}</div>
                    <div>avgLag={diagnostic.abandonedCartDiagnostics.sendLagDiagnostics.reminder2.averageLagMinutes ?? 'n/a'} min</div>
                    <div>maxLag={diagnostic.abandonedCartDiagnostics.sendLagDiagnostics.reminder2.maxLagMinutes ?? 'n/a'} min</div>
                    <div>lagSamples={diagnostic.abandonedCartDiagnostics.sendLagDiagnostics.reminder2.sampleCount}</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="font-medium">cart-reminder-3</div>
                    <div>enabled={diagnostic.abandonedCartDiagnostics.stepConfig.reminder3.enabled ? 'yes' : 'no'}</div>
                    <div>delayMinutes={diagnostic.abandonedCartDiagnostics.stepConfig.reminder3.delayMinutes}</div>
                    <div>pending={diagnostic.abandonedCartDiagnostics.summary.reminder3.pending}</div>
                    <div>dueNow={diagnostic.abandonedCartDiagnostics.summary.reminder3.dueNow}</div>
                    <div>sent={diagnostic.abandonedCartDiagnostics.summary.reminder3.sent}</div>
                    <div>failed={diagnostic.abandonedCartDiagnostics.summary.reminder3.failed}</div>
                    <div>delivered={diagnostic.abandonedCartDiagnostics.summary.reminder3.delivered}</div>
                    <div>avgLag={diagnostic.abandonedCartDiagnostics.sendLagDiagnostics.reminder3.averageLagMinutes ?? 'n/a'} min</div>
                    <div>maxLag={diagnostic.abandonedCartDiagnostics.sendLagDiagnostics.reminder3.maxLagMinutes ?? 'n/a'} min</div>
                    <div>lagSamples={diagnostic.abandonedCartDiagnostics.sendLagDiagnostics.reminder3.sampleCount}</div>
                  </div>
                </div>
                <div>staleProcessing(&gt;2m)={diagnostic.abandonedCartDiagnostics.summary.staleProcessing}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cron + Queue Health</CardTitle>
                <CardDescription>Helps identify scheduler outages vs job-level failures.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="font-medium">process_automations</div>
                  <div>lastRunAt={diagnostic.cronHealth.processAutomations.lastRunAt ?? 'none'}</div>
                  <div>lastOkAt={diagnostic.cronHealth.processAutomations.lastOkAt ?? 'none'}</div>
                  <div>lastErrorAt={diagnostic.cronHealth.processAutomations.lastErrorAt ?? 'none'}</div>
                  <div>minutesSinceLastRun={diagnostic.cronHealth.processAutomations.minutesSinceLastRun ?? 'n/a'}</div>
                  <div>errorsLastHour={diagnostic.cronHealth.processAutomations.errorsLastHour}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="font-medium">process_abandoned_cart</div>
                  <div>lastRunAt={diagnostic.cronHealth.processAbandonedCart.lastRunAt ?? 'none'}</div>
                  <div>lastOkAt={diagnostic.cronHealth.processAbandonedCart.lastOkAt ?? 'none'}</div>
                  <div>lastErrorAt={diagnostic.cronHealth.processAbandonedCart.lastErrorAt ?? 'none'}</div>
                  <div>minutesSinceLastRun={diagnostic.cronHealth.processAbandonedCart.minutesSinceLastRun ?? 'n/a'}</div>
                  <div>errorsLastHour={diagnostic.cronHealth.processAbandonedCart.errorsLastHour}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div>pendingJobs={diagnostic.automationQueueHealth.pendingJobs}</div>
                  <div>processingJobs={diagnostic.automationQueueHealth.processingJobs}</div>
                  <div>failedJobs={diagnostic.automationQueueHealth.failedJobs}</div>
                  <div>dueNowJobs={diagnostic.automationQueueHealth.dueNowJobs}</div>
                  <div>overdueBy5Minutes={diagnostic.automationQueueHealth.overdueBy5Minutes}</div>
                  <div>abandonedCartPendingJobs={diagnostic.automationQueueHealth.abandonedCartPendingJobs}</div>
                  <div>abandonedCartDueNowJobs={diagnostic.automationQueueHealth.abandonedCartDueNowJobs}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Abandoned-Cart Inferred Findings</CardTitle>
              <CardDescription>Direct root-cause hints for this automation only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {(diagnostic.abandonedCartDiagnostics.inferredIssues ?? []).length === 0 ? (
                <p className="text-muted-foreground">No inferred findings.</p>
              ) : (
                <ul className="list-disc pl-5 space-y-1">
                  {diagnostic.abandonedCartDiagnostics.inferredIssues.map((issue, index) => (
                    <li key={`${issue}-${index}`}>{issue}</li>
                  ))}
                </ul>
              )}

              <div className="rounded-lg border p-3">
                <div className="mb-2 font-medium">Core signals (last 2 hours)</div>
                <div>cartRuleEnabled={diagnostic.abandonedCartDiagnostics.coreSignals.cartRuleEnabled ? 'yes' : 'no'}</div>
                <div>addToCartEvents={diagnostic.abandonedCartDiagnostics.coreSignals.addToCartEventsLast2Hours}</div>
                <div>addToCartExternalIds={diagnostic.abandonedCartDiagnostics.coreSignals.addToCartExternalIdsLast2Hours}</div>
                <div>checkoutCompleteEvents={diagnostic.abandonedCartDiagnostics.coreSignals.checkoutCompleteEventsLast2Hours}</div>
                <div>cartJobsCreated={diagnostic.abandonedCartDiagnostics.coreSignals.cartJobsCreatedLast2Hours}</div>
                <div>cartJobsMissingStepKey={diagnostic.abandonedCartDiagnostics.coreSignals.cartJobsMissingStepKeyLast2Hours}</div>
                <div>externalIdsWithDirectActiveTokenMatch={diagnostic.abandonedCartDiagnostics.coreSignals.addToCartExternalIdsWithDirectActiveTokenMatch}</div>
                <div>externalIdsWithoutDirectActiveTokenMatch={diagnostic.abandonedCartDiagnostics.coreSignals.addToCartExternalIdsWithoutDirectActiveTokenMatch}</div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="font-medium">Recent failed reasons: reminder-1</div>
                  {(diagnostic.abandonedCartDiagnostics.recentFailedReasons.reminder1 ?? []).length === 0
                    ? <div className="text-muted-foreground">none</div>
                    : diagnostic.abandonedCartDiagnostics.recentFailedReasons.reminder1.map((reason) => <div key={reason} className="break-words">{reason}</div>)}
                </div>
                <div className="rounded-lg border p-3">
                  <div className="font-medium">Recent failed reasons: reminder-2</div>
                  {(diagnostic.abandonedCartDiagnostics.recentFailedReasons.reminder2 ?? []).length === 0
                    ? <div className="text-muted-foreground">none</div>
                    : diagnostic.abandonedCartDiagnostics.recentFailedReasons.reminder2.map((reason) => <div key={reason} className="break-words">{reason}</div>)}
                </div>
                <div className="rounded-lg border p-3">
                  <div className="font-medium">Recent failed reasons: reminder-3</div>
                  {(diagnostic.abandonedCartDiagnostics.recentFailedReasons.reminder3 ?? []).length === 0
                    ? <div className="text-muted-foreground">none</div>
                    : diagnostic.abandonedCartDiagnostics.recentFailedReasons.reminder3.map((reason) => <div key={reason} className="break-words">{reason}</div>)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export</CardTitle>
              <CardDescription>Copy this JSON for abandoned-cart troubleshooting only.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">
                {JSON.stringify(diagnostic, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function DiagnosticPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <Card>
            <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading diagnostics page...
            </CardContent>
          </Card>
        </div>
      }
    >
      <DiagnosticPageContent />
    </Suspense>
  );
}
