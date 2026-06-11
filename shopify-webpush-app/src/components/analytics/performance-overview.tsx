
'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Button } from '../ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { addDays, eachDayOfInterval, eachMonthOfInterval, differenceInDays, format } from 'date-fns';
import { AreaChart as AreaChartIcon, BarChart3 } from 'lucide-react';
import { useAnalyticsStats } from '@/hooks/queries/use-app-queries';

const PerformanceOverviewChart = dynamic(() => import('./performance-overview-chart'), {
  ssr: false,
  loading: () => <Skeleton className="h-80 w-full" />,
});

export function PerformanceOverview({
  from,
  to,
  shopDomain,
}: {
  from: Date;
  to: Date;
  shopDomain?: string;
}) {
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');

  const { data: payload, isLoading } = useAnalyticsStats(from, to);

  const chartData = useMemo(() => {
    if (!shopDomain || !payload?.ok) {
      const daysDiff = differenceInDays(to, from);
      const emptyPoints = daysDiff > 90
        ? eachMonthOfInterval({ start: from, end: to }).map((m) => ({ date: format(m, 'MMM yy'), revenue: 0 }))
        : eachDayOfInterval({ start: from, end: to }).map((d) => ({ date: format(d, 'MMM d'), revenue: 0 }));
      return { data: emptyPoints, total: 0 };
    }

    const byDate = new Map<string, number>(
      ((payload.dailyRevenue ?? []) as Array<{ date: string; revenueCents: number }>).map((r) => [
        r.date,
        r.revenueCents / 100,
      ]),
    );

    const daysDiff = differenceInDays(to, from);
    let points: { date: string; revenue: number }[];

    if (daysDiff > 90) {
      const months = eachMonthOfInterval({ start: from, end: to });
      points = months.map((monthStart) => {
        const monthKey = format(monthStart, 'yyyy-MM');
        const revenue = Array.from(byDate.entries())
          .filter(([d]) => d.startsWith(monthKey))
          .reduce((sum, [, v]) => sum + v, 0);
        return { date: format(monthStart, 'MMM yy'), revenue };
      });
    } else {
      const days = eachDayOfInterval({ start: from, end: to });
      points = days.map((day) => ({
        date: format(day, 'MMM d'),
        revenue: byDate.get(format(day, 'yyyy-MM-dd')) ?? 0,
      }));
    }

    const total = points.reduce((sum, p) => sum + p.revenue, 0);
    return { data: points, total };
  }, [shopDomain, payload, from, to]);

  const showSkeleton = isLoading && !payload;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Performance Overview</CardTitle>
          <CardDescription>Revenue over the selected period ({formatCurrency(chartData.total)} total)</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant={chartType === 'bar' ? 'default' : 'outline'} size="icon" onClick={() => setChartType('bar')}>
            <BarChart3 className="h-4 w-4" />
          </Button>
          <Button variant={chartType === 'area' ? 'default' : 'outline'} size="icon" onClick={() => setChartType('area')}>
            <AreaChartIcon className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showSkeleton ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <PerformanceOverviewChart chartType={chartType} data={chartData.data} />
        )}
      </CardContent>
    </Card>
  );
}
