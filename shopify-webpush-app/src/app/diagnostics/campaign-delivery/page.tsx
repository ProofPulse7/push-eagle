'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { fetchJsonWithShop } from '@/lib/client/api-fetch';
import { Copy, RefreshCw } from 'lucide-react';

type DiagnosticPayload = {
  ok?: boolean;
  report?: Record<string, unknown>;
  error?: string;
};

export default function CampaignDeliveryDiagnosticPage() {
  const shop = useShopDomain();
  const { toast } = useToast();
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!shop) {
      setError('Open Push Eagle from Shopify admin to run diagnostics.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJsonWithShop<DiagnosticPayload>('/api/diagnostics/campaign-delivery', shop);
      setReport(payload.report ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Diagnostics failed.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyJson = async () => {
    if (!report) {
      return;
    }

    const json = JSON.stringify({ ok: true, shopDomain: shop, report }, null, 2);
    await navigator.clipboard.writeText(json);
    toast({
      title: 'Diagnostic JSON copied',
      description: 'Share this JSON to debug campaign delivery issues.',
    });
  };

  const overallStatus = String(report?.overallStatus ?? 'unknown');
  const issues = Array.isArray(report?.issues) ? (report.issues as string[]) : [];
  const recommendations = Array.isArray(report?.recommendations) ? (report.recommendations as string[]) : [];

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Campaign delivery diagnostics (temporary)</CardTitle>
          <CardDescription>
            Checks audience tokens, billing, Firebase/VAPID, cron queue state, and stuck campaigns. Copy the JSON report and share it for debugging.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Running…' : 'Run diagnostics'}
            </Button>
            <Button variant="outline" onClick={() => void copyJson()} disabled={!report}>
              <Copy className="mr-2 h-4 w-4" />
              Copy JSON report
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {report ? (
            <div className="space-y-4 text-sm">
              <p>
                <strong>Status:</strong>{' '}
                <span className={overallStatus === 'healthy' ? 'text-green-600' : overallStatus === 'warning' ? 'text-yellow-600' : 'text-destructive'}>
                  {overallStatus}
                </span>
              </p>
              {report.summary ? <p>{String(report.summary)}</p> : null}

              {issues.length > 0 ? (
                <div>
                  <strong>Issues</strong>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    {issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {recommendations.length > 0 ? (
                <div>
                  <strong>Recommendations</strong>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    {recommendations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <pre className="max-h-[420px] overflow-auto rounded-md border bg-muted p-3 text-xs">
                {JSON.stringify({ ok: true, shopDomain: shop, report }, null, 2)}
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
