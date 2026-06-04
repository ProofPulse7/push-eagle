'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { useImpressionLimit } from '@/hooks/use-impression-limit';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ImpressionUsageBarProps = {
  className?: string;
  compact?: boolean;
};

export function ImpressionUsageBar({ className, compact }: ImpressionUsageBarProps) {
  const {
    impressionsUsed,
    impressionLimit,
    impressionsRemaining,
    periodEnd,
    atLimit,
    isLoading,
    isFetching,
  } = useImpressionLimit();

  if (isLoading) {
    return null;
  }

  const usagePercent =
    impressionLimit > 0 ? Math.min(100, (impressionsUsed / impressionLimit) * 100) : 0;
  const resetLabel = periodEnd
    ? `Resets ${periodEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : 'Resets on the 1st of each month';

  return (
    <div
      className={cn(
        'rounded-lg border bg-card px-4 py-3 shadow-sm',
        atLimit && 'border-destructive/40 bg-destructive/5',
        className,
      )}
    >
      <div className={cn('flex gap-3', compact ? 'flex-col sm:flex-row sm:items-center' : 'flex-col md:flex-row md:items-center md:justify-between')}>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Monthly impressions</span>
            <span className="text-muted-foreground">
              {impressionsUsed.toLocaleString()} / {impressionLimit.toLocaleString()}
              {isFetching ? ' · updating…' : ''}
            </span>
            <span className="text-xs text-muted-foreground">· {resetLabel}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full transition-all duration-300', atLimit ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
        {atLimit ? (
          <div className="flex shrink-0 items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">Limit reached — sends paused</span>
            <Button size="sm" variant="default" asChild>
              <Link href="/plans">Upgrade</Link>
            </Button>
          </div>
        ) : impressionsRemaining <= impressionLimit * 0.1 ? (
          <Button size="sm" variant="outline" asChild>
            <Link href="/plans">Upgrade plan</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
