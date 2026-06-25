'use client';

import type { DateRange } from 'react-day-picker';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAutomationStats } from '@/hooks/queries/use-app-queries';
import { formatCurrency } from '@/lib/utils';

const StatSkeleton = () => (
  <div className="px-5 py-4">
    <Skeleton className="h-4 w-24 mb-3" />
    <Skeleton className="h-10 w-28" />
  </div>
);

export function AutomationStats({ date }: { date: DateRange | undefined }) {
  const { data, isLoading } = useAutomationStats(date?.from, date?.to);

  const totals = data?.totals as
    | { impressions?: number; clicks?: number; revenueCents?: number }
    | undefined;

  const statsData = [
    { label: 'Impressions', value: Number(totals?.impressions ?? 0).toLocaleString() },
    { label: 'Clicks', value: Number(totals?.clicks ?? 0).toLocaleString() },
    {
      label: 'Revenue generated',
      value: formatCurrency(Number(totals?.revenueCents ?? 0) / 100),
    },
  ];

  const showSkeleton = isLoading && !data;

  return (
    <Card className="overflow-hidden rounded-2xl border-border/80 shadow-sm">
      <CardContent className="grid grid-cols-1 divide-y divide-border p-0 md:grid-cols-3 md:divide-x md:divide-y-0">
        {showSkeleton ? (
          <>
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </>
        ) : (
          statsData.map((stat) => (
            <div key={stat.label} className="px-5 py-4">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground">{stat.value}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
