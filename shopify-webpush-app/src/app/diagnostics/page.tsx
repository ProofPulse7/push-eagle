'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

/* ─── Types ─────────────────────────────────────────────── */

type CheckStatus = 'ok' | 'warn' | 'error';

type CheckResult = {
  name: string;
  status: CheckStatus;
  message: string;
  detail?: string | null;
};

type Section = {
  section: string;
  checks: CheckResult[];
};

type DiagnosticsReport = {
  ok: boolean;
  runAt: string;
  durationMs: number;
  summary: { errors: number; warnings: number };
  sections: Section[];
};

const STORAGE_KEY = 'push_eagle_diagnostics_reports';
const MAX_STORED = 20;

/* ─── Helpers ────────────────────────────────────────────── */

const loadReports = (): DiagnosticsReport[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DiagnosticsReport[];
  } catch {
    return [];
  }
};

const saveReports = (reports: DiagnosticsReport[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports.slice(0, MAX_STORED)));
  } catch {
    // ignore
  }
};

const StatusIcon = ({ status }: { status: CheckStatus | 'running' }) => {
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === 'warn') return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
};

const statusBadgeVariant = (status: CheckStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'ok') return 'default';
  if (status === 'warn') return 'secondary';
  return 'destructive';
};

/* ─── Sub-components ─────────────────────────────────────── */

const CheckRow = ({ check }: { check: CheckResult }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = Boolean(check.detail);

  return (
    <div className="rounded-md border bg-card p-3 space-y-1">
      <div
        className={`flex items-start gap-2 ${hasDetail ? 'cursor-pointer' : ''}`}
        onClick={() => hasDetail && setExpanded((v) => !v)}
        role={hasDetail ? 'button' : undefined}
        tabIndex={hasDetail ? 0 : undefined}
        onKeyDown={(e) => hasDetail && e.key === 'Enter' && setExpanded((v) => !v)}
      >
        <StatusIcon status={check.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{check.name}</span>
            <Badge variant={statusBadgeVariant(check.status)} className="text-xs py-0">
              {check.status.toUpperCase()}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{check.message}</p>
        </div>
        {hasDetail && (
          expanded
            ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </div>
      {expanded && check.detail && (
        <pre className="text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap break-all mt-2">
          {check.detail}
        </pre>
      )}
    </div>
  );
};

const SectionBlock = ({ section }: { section: Section }) => {
  const errorCount = section.checks.filter((c) => c.status === 'error').length;
  const warnCount = section.checks.filter((c) => c.status === 'warn').length;

  const sectionStatus: CheckStatus = errorCount > 0 ? 'error' : warnCount > 0 ? 'warn' : 'ok';

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <StatusIcon status={sectionStatus} />
          <CardTitle className="text-base">{section.section}</CardTitle>
          {errorCount > 0 && (
            <Badge variant="destructive" className="text-xs py-0">{errorCount} error{errorCount > 1 ? 's' : ''}</Badge>
          )}
          {warnCount > 0 && (
            <Badge variant="secondary" className="text-xs py-0">{warnCount} warning{warnCount > 1 ? 's' : ''}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        {section.checks.map((check, i) => (
          <CheckRow key={i} check={check} />
        ))}
      </CardContent>
    </Card>
  );
};

const ReportView = ({ report }: { report: DiagnosticsReport }) => {
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
  }, [report]);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
          report.ok
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
        }`}>
          {report.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {report.ok ? 'All checks passed' : `${report.summary.errors} error${report.summary.errors !== 1 ? 's' : ''} found`}
        </div>
        {report.summary.warnings > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4" />
            {report.summary.warnings} warning{report.summary.warnings !== 1 ? 's' : ''}
          </div>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {new Date(report.runAt).toLocaleString()} · {report.durationMs}ms
        </span>
        <Button variant="outline" size="sm" onClick={copy} className="h-7 gap-1.5 text-xs">
          <ClipboardCopy className="h-3.5 w-3.5" />
          Copy JSON
        </Button>
      </div>

      {/* Error summary */}
      {report.summary.errors > 0 && (
        <Alert className="border-red-400/50 bg-red-50 dark:bg-red-950/20">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 dark:text-red-300">
            <strong>Action required:</strong> Fix the errors below to enable R2 image storage and automation notifications.
            Check that all R2 environment variables are set on Vercel (project settings → Environment Variables) and trigger a redeploy.
          </AlertDescription>
        </Alert>
      )}

      {/* Sections */}
      {report.sections.map((section, i) => (
        <SectionBlock key={i} section={section} />
      ))}
    </div>
  );
};

/* ─── Main page ─────────────────────────────────────────── */

export default function DiagnosticsPage() {
  const [reports, setReports] = useState<DiagnosticsReport[]>([]);
  const [running, setRunning] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    setReports(loadReports());
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    try {
      const response = await fetch('/api/diagnostics/run');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      const report = (await response.json()) as DiagnosticsReport;
      if (!mountedRef.current) return;

      setReports((prev) => {
        const updated = [report, ...prev];
        saveReports(updated);
        return updated;
      });
      setActiveIndex(0);
    } catch (error) {
      if (!mountedRef.current) return;
      const errorReport: DiagnosticsReport = {
        ok: false,
        runAt: new Date().toISOString(),
        durationMs: 0,
        summary: { errors: 1, warnings: 0 },
        sections: [
          {
            section: 'Diagnostics Runner',
            checks: [
              {
                name: 'API Connection',
                status: 'error',
                message: 'Failed to reach /api/diagnostics/run',
                detail: error instanceof Error ? error.message : String(error),
              },
            ],
          },
        ],
      };
      setReports((prev) => {
        const updated = [errorReport, ...prev];
        saveReports(updated);
        return updated;
      });
      setActiveIndex(0);
    } finally {
      if (mountedRef.current) setRunning(false);
    }
  }, []);

  const clearReports = useCallback(() => {
    setReports([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <div className="flex-1 space-y-6 p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Diagnostics</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Test R2 storage, database, Firebase Admin, and automation configuration.
            Run this to troubleshoot image upload failures or notification delivery issues.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reports.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearReports}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Clear Reports
            </Button>
          )}
          <Button onClick={runDiagnostics} disabled={running} className="gap-2">
            {running
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            {running ? 'Running…' : 'Run Diagnostics'}
          </Button>
        </div>
      </div>

      {/* Guidance alert */}
      <Alert className="border-blue-400/50 bg-blue-50 dark:bg-blue-950/20">
        <AlertDescription className="text-blue-800 dark:text-blue-300 text-sm space-y-1">
          <p>
            <strong>If you see "R2_BUCKET_NAME is not configured":</strong> The environment variables
            are missing on Vercel. Go to your Vercel project → Settings → Environment Variables and add:
          </p>
          <code className="block text-xs bg-blue-100 dark:bg-blue-900/40 rounded p-2 mt-1 font-mono whitespace-pre">
{`R2_ACCOUNT_ID
R2_BUCKET_NAME
R2_S3_ENDPOINT
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_PUBLIC_BASE_URL`}
          </code>
          <p className="mt-1">Then trigger a Vercel redeploy and re-save your reminder images.</p>
        </AlertDescription>
      </Alert>

      {/* No reports yet */}
      {reports.length === 0 && !running && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <RefreshCw className="h-10 w-10 text-muted-foreground mb-4" />
            <CardTitle className="text-base mb-2">No diagnostic reports yet</CardTitle>
            <CardDescription>Click "Run Diagnostics" to check your system configuration.</CardDescription>
          </CardContent>
        </Card>
      )}

      {/* Running spinner */}
      {running && (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-muted-foreground">Running all checks…</span>
          </CardContent>
        </Card>
      )}

      {/* Reports */}
      {reports.length > 0 && !running && (
        <div className="space-y-6">
          {/* Report tabs if multiple */}
          {reports.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">History:</span>
              {reports.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    activeIndex === i
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card hover:bg-muted border-border text-muted-foreground'
                  }`}
                >
                  {i === 0 ? 'Latest' : `Run ${reports.length - i}`}
                  {' '}·{' '}
                  {r.summary.errors > 0 ? `${r.summary.errors}E` : r.summary.warnings > 0 ? `${r.summary.warnings}W` : '✓'}
                </button>
              ))}
            </div>
          )}

          <Separator />

          <ReportView report={reports[activeIndex]} />
        </div>
      )}
    </div>
  );
}
