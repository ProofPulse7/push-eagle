'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, Download, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useShopDomain } from '@/hooks/use-shop-domain';
import type { ShopifyBillingDiagnosticReport } from '@/lib/server/diagnostics/shopify-billing-diagnostics';

export default function ShopifyBillingDiagnosticsPage() {
  const shop = useShopDomain();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ShopifyBillingDiagnosticReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = shop ? `?shop=${encodeURIComponent(shop)}` : '';
      const response = await fetch(`/api/diagnostics/shopify-billing${query}`, { cache: 'no-store' });
      const payload = (await response.json()) as {
        ok?: boolean;
        report?: ShopifyBillingDiagnosticReport;
        error?: string;
      };
      if (!response.ok || !payload.report) {
        throw new Error(payload.error || `Diagnostics failed (${response.status}).`);
      }
      setReport(payload.report);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to load diagnostics.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    void load();
  }, [load]);

  const jsonText = report ? JSON.stringify(report, null, 2) : '';

  const copyJson = async () => {
    if (!jsonText) {
      return;
    }
    await navigator.clipboard.writeText(jsonText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const downloadJson = () => {
    if (!jsonText) {
      return;
    }
    const blob = new Blob([jsonText], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `push-eagle-billing-diagnostics-${shop || 'unknown'}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Shopify Billing Diagnostics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Checks Neon, Remix OAuth session, offline token sync, and Shopify GraphQL for Plans checkout.
          </p>
          {shop ? (
            <p className="mt-2 text-sm">
              Store: <strong>{shop}</strong>
            </p>
          ) : (
            <p className="mt-2 text-sm text-amber-700">No shop detected — open from Shopify admin first.</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Re-run
          </Button>
          <Button variant="outline" onClick={() => void copyJson()} disabled={!jsonText}>
            <Copy className="mr-2 h-4 w-4" />
            {copied ? 'Copied' : 'Copy JSON'}
          </Button>
          <Button onClick={downloadJson} disabled={!jsonText}>
            <Download className="mr-2 h-4 w-4" />
            Download JSON
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Running diagnostics…
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Diagnostics error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {report ? (
        <>
          <Alert variant={report.overallStatus === 'healthy' ? 'default' : 'destructive'}>
            {report.overallStatus === 'healthy' ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertTitle>{report.summary}</AlertTitle>
            <AlertDescription>Status: {report.overallStatus}</AlertDescription>
          </Alert>

          {report.issues.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Issues found</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  {report.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {report.recommendations.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>How to fix</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-sm">
                  {report.recommendations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Full diagnostic JSON</CardTitle>
              <CardDescription>Share this file with support to pinpoint the billing failure.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[480px] overflow-auto rounded-md bg-muted p-4 text-xs">{jsonText}</pre>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
