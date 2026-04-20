'use client';

import { Suspense, useMemo, useState } from 'react';
import { AlertTriangle, Bug, Copy, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCachedJson } from '@/hooks/use-cached-json';

type DiagnosticsPayload = {
  ok?: boolean;
  error?: string;
  shopDomain?: string;
  checkedAt?: string;
  processing?: { dueJobs?: number; sentCount?: number; failedCount?: number };
  storefront?: {
    checkedAt?: string;
    tokenSummary?: Array<{ tokenType: string; status: string; total: number }>;
    recentFailures?: Array<{ reason: string; total: number }>;
    recentDiagnostics?: Array<{
      id: number;
      eventType: string;
      status: string;
      reason: string | null;
      message: string | null;
      tokenType: string | null;
      browser: string | null;
      platform: string | null;
      locale: string | null;
      permissionState: string | null;
      endpoint: string | null;
      externalId: string | null;
      details: Record<string, unknown> | null;
      createdAt: string | null;
    }>;
    recentTokens?: Array<{
      id: number;
      tokenType: string;
      status: string;
      tokenPreview: string;
      updatedAt: string | null;
      lastSeenAt: string | null;
      externalId: string | null;
      browser: string | null;
      platform: string | null;
    }>;
    recentWelcomeJobs?: Array<{
      id: string;
      stepKey: string;
      status: string;
      errorMessage: string | null;
      updatedAt: string | null;
      sentAt: string | null;
      externalId: string | null;
    }>;
    issues?: string[];
    env?: { firebaseVapidConfigured?: boolean; webPushVapidConfigured?: boolean };
  };
  welcome?: {
    summary?: {
      reminder2?: { dueNow?: number; sent?: number; failed?: number; delivered?: number };
      reminder3?: { dueNow?: number; sent?: number; failed?: number; delivered?: number };
      staleProcessing?: number;
    };
    inferredIssues?: string[];
  };
};

function DiagnosticsContent() {
  const searchParams = useSearchParams();
  const [nonce, setNonce] = useState(0);
  const shopDomain = (searchParams.get('shop') || '').trim();

  const diagnosticsUrl = shopDomain
    ? `/api/diagnostics/run?shop=${encodeURIComponent(shopDomain)}&r=${String(nonce)}`
    : '';

  const { data } = useCachedJson<DiagnosticsPayload>({
    cacheKey: `diagnostics:${shopDomain}:${nonce}`,
    url: diagnosticsUrl,
    enabled: Boolean(diagnosticsUrl),
    refreshMs: 10_000,
  });

  const report = useMemo(() => {
    if (!shopDomain) {
      return 'Missing shop context. Open app from Shopify with ?shop=... in URL.';
    }

    if (!data?.ok) {
      return `Diagnostics failed: ${data?.error ?? 'unknown error'}`;
    }

    const tokenSummary = data.storefront?.tokenSummary ?? [];
    const recentFailures = data.storefront?.recentFailures ?? [];
    const recentDiagnostics = data.storefront?.recentDiagnostics ?? [];
    const recentTokens = data.storefront?.recentTokens ?? [];
    const recentWelcomeJobs = data.storefront?.recentWelcomeJobs ?? [];
    const issues = [...(data.storefront?.issues ?? []), ...(data.welcome?.inferredIssues ?? [])];

    return [
      `shop=${data.shopDomain ?? shopDomain}`,
      `checkedAt=${data.checkedAt ?? 'n/a'}`,
      `processing dueJobs=${data.processing?.dueJobs ?? 0} sent=${data.processing?.sentCount ?? 0} failed=${data.processing?.failedCount ?? 0}`,
      `env firebaseVapidConfigured=${data.storefront?.env?.firebaseVapidConfigured ? 'yes' : 'no'} webPushVapidConfigured=${data.storefront?.env?.webPushVapidConfigured ? 'yes' : 'no'}`,
      'token summary:',
      ...(tokenSummary.length > 0 ? tokenSummary.map((item) => `${item.tokenType}:${item.status}=${item.total}`) : ['none']),
      'recent token failures (24h):',
      ...(recentFailures.length > 0 ? recentFailures.map((item) => `${item.reason}=${item.total}`) : ['none']),
      `welcome reminder-2 dueNow=${data.welcome?.summary?.reminder2?.dueNow ?? 0} sent=${data.welcome?.summary?.reminder2?.sent ?? 0} delivered=${data.welcome?.summary?.reminder2?.delivered ?? 0} failed=${data.welcome?.summary?.reminder2?.failed ?? 0}`,
      `welcome reminder-3 dueNow=${data.welcome?.summary?.reminder3?.dueNow ?? 0} sent=${data.welcome?.summary?.reminder3?.sent ?? 0} delivered=${data.welcome?.summary?.reminder3?.delivered ?? 0} failed=${data.welcome?.summary?.reminder3?.failed ?? 0}`,
      `welcome staleProcessing=${data.welcome?.summary?.staleProcessing ?? 0}`,
      'issues:',
      ...(issues.length > 0 ? issues.map((item, index) => `${index + 1}. ${item}`) : ['1. no inferred issues']),
      'recent diagnostics events:',
      ...(recentDiagnostics.slice(0, 40).map((row) => [
        `id=${row.id}`,
        `at=${row.createdAt ?? 'n/a'}`,
        `event=${row.eventType}`,
        `status=${row.status}`,
        `reason=${row.reason ?? 'null'}`,
        `message=${row.message ?? 'null'}`,
        `tokenType=${row.tokenType ?? 'null'}`,
        `browser=${row.browser ?? 'null'}`,
        `platform=${row.platform ?? 'null'}`,
        `permission=${row.permissionState ?? 'null'}`,
        `endpoint=${row.endpoint ?? 'null'}`,
        `externalId=${row.externalId ?? 'null'}`,
      ].join(' | ')) || ['none']),
      'recent tokens:',
      ...(recentTokens.slice(0, 20).map((row) => [
        `id=${row.id}`,
        `type=${row.tokenType}`,
        `status=${row.status}`,
        `tokenPreview=${row.tokenPreview}`,
        `externalId=${row.externalId ?? 'null'}`,
        `browser=${row.browser ?? 'null'}`,
        `platform=${row.platform ?? 'null'}`,
        `updatedAt=${row.updatedAt ?? 'null'}`,
        `lastSeenAt=${row.lastSeenAt ?? 'null'}`,
      ].join(' | ')) || ['none']),
      'recent welcome jobs:',
      ...(recentWelcomeJobs.slice(0, 30).map((job) => [
        `job=${job.id}`,
        `step=${job.stepKey}`,
        `status=${job.status}`,
        `externalId=${job.externalId ?? 'null'}`,
        `sentAt=${job.sentAt ?? 'null'}`,
        `updatedAt=${job.updatedAt ?? 'null'}`,
        `error=${job.errorMessage ?? 'null'}`,
      ].join(' | ')) || ['none']),
    ].join('\n');
  }, [data, shopDomain]);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
    } catch (_error) {
      // No-op. Browser clipboard permission controls this.
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Diagnostics
          </h1>
          <p className="text-muted-foreground text-sm">
            Run full token and welcome automation diagnostics, then copy and share the report.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button type="button" onClick={copyReport}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Report
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            Full Detailed Report
          </CardTitle>
          <CardDescription>
            This includes token registration errors, save status, recent tokens, and welcome delivery traces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[70vh] overflow-auto rounded border bg-muted p-3 text-xs whitespace-pre-wrap">{report}</pre>
        </CardContent>
      </Card>
    </div>
  );
}

export default function DiagnosticsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Loading diagnostics…</div>}>
      <DiagnosticsContent />
    </Suspense>
  );
}
