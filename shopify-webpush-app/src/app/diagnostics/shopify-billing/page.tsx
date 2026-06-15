'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { fetchJsonWithShop } from '@/lib/client/api-fetch';

type DiagnosticReport = {
  overallStatus?: string;
  summary?: string;
  issues?: string[];
  recommendations?: string[];
};

export default function ShopifyBillingDiagnosticPage() {
  const shop = useShopDomain();
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!shop) {
      setError('Open Push Eagle from Shopify admin to run diagnostics.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await fetchJsonWithShop<{ report?: DiagnosticReport }>(
        '/api/diagnostics/shopify-billing',
        shop,
      );
      setReport(payload.report ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Diagnostics failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [shop]);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Shopify billing diagnostics</CardTitle>
          <CardDescription>
            Verify offline tokens, billing database connectivity, and Shopify subscription sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => void load()} disabled={loading}>
            {loading ? 'Running…' : 'Run diagnostics'}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {report ? (
            <div className="space-y-3 text-sm">
              <p>
                <strong>Status:</strong> {report.overallStatus ?? 'unknown'}
              </p>
              {report.summary ? <p>{report.summary}</p> : null}
              {report.issues?.length ? (
                <div>
                  <strong>Issues</strong>
                  <ul className="list-disc pl-5">
                    {report.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {report.recommendations?.length ? (
                <div>
                  <strong>Recommendations</strong>
                  <ul className="list-disc pl-5">
                    {report.recommendations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
