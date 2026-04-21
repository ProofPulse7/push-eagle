'use client';

import { Suspense, useEffect, useState } from 'react';

import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Copy,
  Info,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSettings } from '@/context/settings-context';

interface DiagnosticIssue {
  severity: 'error' | 'warning' | 'info';
  component: string;
  title: string;
  description: string;
  details?: Record<string, unknown>;
}

interface DiagnosticResult {
  ok: boolean;
  checkedAt: string;
  shopDomain: string;
  issues: DiagnosticIssue[];
  welcomeDiagnostics?: {
    checkedAt: string;
    summary: {
      reminder2: { pending: number; dueNow: number; processing: number; sent: number; delivered: number; failed: number; skipped: number; lastDeliveredAt: string | null };
      reminder3: { pending: number; dueNow: number; processing: number; sent: number; delivered: number; failed: number; skipped: number; lastDeliveredAt: string | null };
      staleProcessing: number;
    };
    stepConfig: Record<string, unknown>;
    recentJobs: Array<Record<string, unknown>>;
    inferredIssues: string[];
  };
  duplicateReminderGroups?: Array<{
    externalId: string;
    stepKey: string;
    deliveryCount: number;
    tokenCount: number;
    subscriberCount: number;
    spreadSeconds: number;
    firstDeliveredAt: string | null;
    lastDeliveredAt: string | null;
  }>;
  multiTokenExternalIds?: Array<{
    externalId: string;
    activeTokenCount: number;
    subscriberCount: number;
    latestSeenAt: string | null;
  }>;
  clickTracking?: {
    deliveries7d: number;
    deliveryRowsClicked7d: number;
    clicks7d: number;
    lastDeliveryClickAt: string | null;
    lastAutomationClickAt: string | null;
  };
  recentWelcomeDeliveries?: Array<{
    id: number;
    externalId: string | null;
    subscriberId: number | null;
    tokenId: number | null;
    stepKey: string;
    targetUrl: string | null;
    deliveredAt: string | null;
    clickedAt: string | null;
  }>;
  recentAutomationClicks?: Array<{
    id: number;
    externalId: string | null;
    targetUrl: string;
    clickedAt: string | null;
  }>;
}

function DiagnosticPageContent() {
  const { shopDomain } = useSettings();
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop') || shopDomain || '';

  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const clearOldResults = async () => {
    if (!shop || clearing) {
      return;
    }

    setClearing(true);
    setError(null);
    try {
      const response = await fetch(`/api/automations/welcome-diagnostics?shop=${encodeURIComponent(shop)}`, {
        method: 'POST',
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Failed to clear old welcome results.');
      }
      await fetchDiagnostic();
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Failed to clear old results.');
    } finally {
      setClearing(false);
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
  const infoCount = diagnostic?.issues.filter((issue) => issue.severity === 'info').length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Diagnostics</h1>
          <p className="mt-2 text-sm text-muted-foreground">Run one report for duplicate welcome reminders and missing click tracking.</p>
          <p className="mt-1 text-sm text-muted-foreground">Shop: {shop}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={clearOldResults} disabled={loading || clearing}>
            <Trash2 className="mr-2 h-4 w-4" />
            {clearing ? 'Clearing...' : 'Clear old results'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchDiagnostic} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={copyDiagnostic} disabled={!diagnostic}>
            <Copy className="mr-2 h-4 w-4" />
            {copied ? 'Copied' : 'Copy diagnostic JSON'}
          </Button>
        </div>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Running diagnostic checks...
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
                {diagnostic.ok ? 'No blocking issues found' : 'Issues found'}
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
                <div className="text-2xl font-bold text-blue-600">{diagnostic.duplicateReminderGroups?.length ?? 0}</div>
                <div className="text-sm text-muted-foreground">Duplicate reminder groups</div>
              </div>
              <div className="rounded-lg border p-4">
                <div className="text-2xl font-bold text-slate-900">{diagnostic.clickTracking?.clicks7d ?? 0}</div>
                <div className="text-sm text-muted-foreground">Welcome clicks in last 7 days</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Issues</CardTitle>
              <CardDescription>These are the checks to copy back after you reproduce the problem.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {diagnostic.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">No issues were inferred from the current data.</p>
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
                <CardTitle>Click tracking snapshot</CardTitle>
                <CardDescription>Compares deliveries, delivery click flags, and automation click rows.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>Deliveries in last 7 days: {diagnostic.clickTracking?.deliveries7d ?? 0}</div>
                <div>Delivery rows marked clicked: {diagnostic.clickTracking?.deliveryRowsClicked7d ?? 0}</div>
                <div>Automation click rows in DB: {diagnostic.clickTracking?.clicks7d ?? 0}</div>
                <div>Last delivery clicked_at: {diagnostic.clickTracking?.lastDeliveryClickAt ?? 'none'}</div>
                <div>Last automation click row: {diagnostic.clickTracking?.lastAutomationClickAt ?? 'none'}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Welcome sequence snapshot</CardTitle>
                <CardDescription>Current reminder queue and send state.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="font-medium">Reminder 2</div>
                  <div>pending={diagnostic.welcomeDiagnostics?.summary.reminder2.pending ?? 0} dueNow={diagnostic.welcomeDiagnostics?.summary.reminder2.dueNow ?? 0} processing={diagnostic.welcomeDiagnostics?.summary.reminder2.processing ?? 0} sent={diagnostic.welcomeDiagnostics?.summary.reminder2.sent ?? 0} delivered={diagnostic.welcomeDiagnostics?.summary.reminder2.delivered ?? 0}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="font-medium">Reminder 3</div>
                  <div>pending={diagnostic.welcomeDiagnostics?.summary.reminder3.pending ?? 0} dueNow={diagnostic.welcomeDiagnostics?.summary.reminder3.dueNow ?? 0} processing={diagnostic.welcomeDiagnostics?.summary.reminder3.processing ?? 0} sent={diagnostic.welcomeDiagnostics?.summary.reminder3.sent ?? 0} delivered={diagnostic.welcomeDiagnostics?.summary.reminder3.delivered ?? 0}</div>
                </div>
                <div>Stale processing jobs: {diagnostic.welcomeDiagnostics?.summary.staleProcessing ?? 0}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Duplicate reminder groups</CardTitle>
                <CardDescription>Same external user receiving the same reminder more than once.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(diagnostic.duplicateReminderGroups ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No duplicate groups found.</p>
                ) : (
                  diagnostic.duplicateReminderGroups?.map((group) => (
                    <div key={`${group.externalId}-${group.stepKey}`} className="rounded-lg border p-3 text-sm">
                      <div className="font-medium">{group.stepKey} • {group.externalId}</div>
                      <div>deliveries={group.deliveryCount} tokens={group.tokenCount} subscribers={group.subscriberCount} spreadSeconds={group.spreadSeconds}</div>
                      <div>first={group.firstDeliveredAt ?? 'none'}</div>
                      <div>last={group.lastDeliveredAt ?? 'none'}</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Multiple active tokens by external user</CardTitle>
                <CardDescription>Useful when one user receives the same reminder on multiple active browser tokens.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(diagnostic.multiTokenExternalIds ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No multi-token external users found.</p>
                ) : (
                  diagnostic.multiTokenExternalIds?.map((group) => (
                    <div key={group.externalId} className="rounded-lg border p-3 text-sm">
                      <div className="font-medium">{group.externalId}</div>
                      <div>activeTokens={group.activeTokenCount} subscribers={group.subscriberCount}</div>
                      <div>latestSeenAt={group.latestSeenAt ?? 'none'}</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent welcome deliveries</CardTitle>
                <CardDescription>Latest sent reminder records from automation_deliveries.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(diagnostic.recentWelcomeDeliveries ?? []).slice(0, 10).map((delivery) => (
                  <div key={delivery.id} className="rounded-lg border p-3 text-sm">
                    <div className="font-medium">#{delivery.id} • {delivery.stepKey}</div>
                    <div>externalId={delivery.externalId ?? 'none'} tokenId={delivery.tokenId ?? 'none'} subscriberId={delivery.subscriberId ?? 'none'}</div>
                    <div>deliveredAt={delivery.deliveredAt ?? 'none'}</div>
                    <div>clickedAt={delivery.clickedAt ?? 'none'}</div>
                    <div className="break-all">targetUrl={delivery.targetUrl ?? 'none'}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent automation clicks</CardTitle>
                <CardDescription>Latest welcome click rows from automation_clicks.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(diagnostic.recentAutomationClicks ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No welcome automation clicks found.</p>
                ) : (
                  diagnostic.recentAutomationClicks?.slice(0, 10).map((click) => (
                    <div key={click.id} className="rounded-lg border p-3 text-sm">
                      <div className="font-medium">#{click.id}</div>
                      <div>externalId={click.externalId ?? 'none'}</div>
                      <div>clickedAt={click.clickedAt ?? 'none'}</div>
                      <div className="break-all">targetUrl={click.targetUrl}</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Export</CardTitle>
              <CardDescription>Copy this JSON and paste it in chat after you reproduce the issue.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-80 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">
                {JSON.stringify(diagnostic, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}

      {!loading && diagnostic && infoCount > 0 && (
        <p className="text-xs text-muted-foreground">Informational checks: {infoCount}</p>
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
