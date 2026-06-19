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
    <div className={cn('px-4 py-6 sm:px-6 md:px-8 md:py-8', className)}>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-8 w-48" />
        {description ? <Skeleton className="h-4 w-72 max-w-full" /> : <Skeleton className="h-4 w-56 max-w-full" />}
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
      <span className="sr-only">Loading {title}</span>
    </div>
  );
}

export function DataRefreshingBar({ label = 'Updating data…' }: { label?: string }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-3 z-[190] flex items-center gap-2 rounded-full border border-border/60 bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur-sm"
    >
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
    <div className="relative flex flex-col">
      {hasData && isFetching ? <DataRefreshingBar label={`Refreshing ${title.toLowerCase()}…`} /> : null}
      {error ? (
        <p className="mx-4 mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-6 md:mx-8">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}
