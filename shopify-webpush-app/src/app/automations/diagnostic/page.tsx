'use client';

import { useSettings } from '@/context/settings-context';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, CheckCircle, Info, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DiagnosticIssue {
  severity: 'error' | 'warning' | 'info';
  component: string;
  title: string;
  description: string;
  details?: Record<string, any>;
}

interface DiagnosticResult {
  ok: boolean;
  checkedAt: string;
  shopDomain: string;
  issues: DiagnosticIssue[];
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
}

export default function DiagnosticPage() {
  const { shopDomain } = useSettings();
  const searchParams = useSearchParams();
  const paramShop = searchParams.get('shop');
  const shop = paramShop || shopDomain || '';

  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostic = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/automations/diagnostic?shop=${encodeURIComponent(shop)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDiagnostic(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (shop) {
      fetchDiagnostic();
    }
  }, [shop]);

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-600" />;
      default:
        return null;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'destructive';
      case 'warning':
        return 'secondary';
      case 'info':
        return 'outline';
      default:
        return 'default';
    }
  };

  if (!shop) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Shop not found</AlertTitle>
          <AlertDescription>Please open this page from an automation context.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Automation Diagnostic</h1>
          <p className="text-gray-600 mt-2">Shop: {shop}</p>
        </div>
        <Button onClick={fetchDiagnostic} disabled={loading} size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Running diagnostic checks...
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {diagnostic && !loading && (
        <>
          {/* Status Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {diagnostic.ok ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        All Checks Passed
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                        Issues Found
                      </>
                    )}
                  </CardTitle>
                  <CardDescription>Last checked: {new Date(diagnostic.checkedAt).toLocaleString()}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {diagnostic.issues.filter(i => i.severity === 'error').length}
                  </div>
                  <div className="text-sm text-gray-600">Errors</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {diagnostic.issues.filter(i => i.severity === 'warning').length}
                  </div>
                  <div className="text-sm text-gray-600">Warnings</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {diagnostic.issues.filter(i => i.severity === 'info').length}
                  </div>
                  <div className="text-sm text-gray-600">Info</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Issues */}
          {diagnostic.issues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Issues Found</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {diagnostic.issues.map((issue, idx) => (
                  <div key={idx} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      {getSeverityIcon(issue.severity)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{issue.title}</h3>
                          <Badge variant={getSeverityColor(issue.severity) as any}>
                            {issue.severity.toUpperCase()}
                          </Badge>
                          <Badge variant="outline">{issue.component}</Badge>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{issue.description}</p>
                      </div>
                    </div>
                    {issue.details && (
                      <details className="cursor-pointer">
                        <summary className="text-sm font-medium text-gray-700 hover:text-gray-900">
                          Show details
                        </summary>
                        <pre className="mt-2 bg-gray-100 p-2 rounded text-xs overflow-auto">
                          {JSON.stringify(issue.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Automation Config */}
          {diagnostic.automationStepConfig && (
            <Card>
              <CardHeader>
                <CardTitle>Automation Step Configuration</CardTitle>
                <CardDescription>Current welcome_subscriber automation steps</CardDescription>
              </CardHeader>
              <CardContent>
                <details className="cursor-pointer">
                  <summary className="font-medium text-gray-700 hover:text-gray-900">
                    View full configuration
                  </summary>
                  <pre className="mt-3 bg-gray-100 p-3 rounded text-xs overflow-auto max-h-96">
                    {JSON.stringify(diagnostic.automationStepConfig, null, 2)}
                  </pre>
                </details>
              </CardContent>
            </Card>
          )}

          {/* Recent Jobs */}
          {diagnostic.recentAutomationJobs && diagnostic.recentAutomationJobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Automation Jobs</CardTitle>
                <CardDescription>Last 10 queued automation jobs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {diagnostic.recentAutomationJobs.map((job) => (
                  <div key={job.id} className="border rounded p-3 text-sm space-y-1">
                    <div className="font-mono text-xs text-gray-500">ID: {job.id.substring(0, 12)}...</div>
                    <div>
                      <span className="font-semibold">Status:</span>{' '}
                      <Badge
                        variant={job.status === 'pending' ? 'secondary' : job.status === 'sent' ? 'outline' : 'destructive'}
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-semibold">Due:</span> {new Date(job.due_at).toLocaleString()}
                    </div>
                    {job.payload.targetUrl && (
                      <div className="text-xs">
                        <span className="font-semibold">Target URL:</span>
                        <code className="block mt-1 bg-gray-100 p-1 rounded break-all">
                          {job.payload.targetUrl}
                        </code>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Copy diagnostic as JSON */}
          <Card>
            <CardHeader>
              <CardTitle>Export Diagnostic</CardTitle>
              <CardDescription>Copy this JSON for debugging</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
                  alert('Diagnostic copied to clipboard!');
                }}
                variant="secondary"
                className="w-full"
              >
                Copy Diagnostic JSON
              </Button>
              <pre className="mt-4 bg-gray-100 p-3 rounded text-xs overflow-auto max-h-64">
                {JSON.stringify(diagnostic, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
