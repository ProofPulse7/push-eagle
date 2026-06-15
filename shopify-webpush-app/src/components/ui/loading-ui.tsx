'use client';

import { Loader2 } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { TopLoadingBar } from '@/components/ui/top-loading-bar';
import { cn } from '@/lib/utils';

export function SetupProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-full max-w-md space-y-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
        />
      </div>
      <p className="text-center text-xs text-muted-foreground">{Math.round(progress)}% complete</p>
    </div>
  );
}

type AppSetupScreenProps = {
  progress: number;
  stepLabel: string;
  error?: string | null;
  onRetry?: () => void;
};

export function AppSetupScreen({ progress, stepLabel, error, onRetry }: AppSetupScreenProps) {
  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-background px-6">
      <TopLoadingBar active progress={progress} />
      <div className="flex max-w-lg flex-col items-center gap-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Setting up Push Eagle</h1>
          <p className="text-muted-foreground">
            We&apos;re loading your store data so the app feels instant afterward.
          </p>
        </div>
        <SetupProgressBar progress={progress} />
        <p className="text-sm font-medium text-foreground">{stepLabel}</p>
        {error ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type PageLoadingViewProps = {
  title: string;
  description?: string;
  className?: string;
};

export function PageLoadingView({ title, description, className }: PageLoadingViewProps) {
  return (
    <div className={cn('p-4 sm:p-6 md:p-8 flex flex-col gap-8', className)}>
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48" />
          {description ? <Skeleton className="h-4 w-72 mt-2" /> : null}
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading {title}…</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

export function DataRefreshingBar({ label = 'Updating data…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

type PageLoadingShellProps = {
  title: string;
  description?: string;
  isLoading: boolean;
  hasData: boolean;
  isFetching?: boolean;
  error?: string | null;
  children: React.ReactNode;
};

export function PageLoadingShell({
  title,
  description,
  isLoading,
  hasData,
  isFetching = false,
  error,
  children,
}: PageLoadingShellProps) {
  if (!hasData && isLoading) {
    return <PageLoadingView title={title} description={description} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {hasData && isFetching ? <DataRefreshingBar label={`Refreshing ${title.toLowerCase()}…`} /> : null}
      {error ? (
        <p className="mx-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-6 md:mx-8">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}
