'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { format, eachDayOfInterval, addDays } from 'date-fns';
import { AreaChart as AreaChartIcon, BarChart3 } from 'lucide-react';
import { useAnalyticsStats } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';

const DashboardPerformanceChart = dynamic(() => import('./dashboard-performance-chart'), {
  ssr: false,
  loading: () => <Skeleton className="h-80 w-full" />,
});

export function PerformanceChart() {
  const shopDomain = useShopDomain();
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');

  const to = new Date();
  const from = addDays(to, -6);
  const { data: payload, isLoading } = useAnalyticsStats(from, to);

  const chartData = useMemo(() => {
    if (!shopDomain || !payload?.ok) {
      const emptyDays = eachDayOfInterval({ start: from, end: to }).map((day) => ({
        date: format(day, 'MMM d'),
        revenue: 0,
      }));
      return { data: emptyDays, total: 0 };
    }

    const byDate = new Map<string, number>(
      ((payload.dailyRevenue ?? []) as Array<{ date: string; revenueCents: number }>).map((r) => [
        r.date,
        r.revenueCents / 100,
      ]),
    );

    const days = eachDayOfInterval({ start: from, end: to });
    const points = days.map((day) => ({
      date: format(day, 'MMM d'),
      revenue: byDate.get(format(day, 'yyyy-MM-dd')) ?? 0,
    }));

    const total = points.reduce((sum, p) => sum + p.revenue, 0);
    return { data: points, total };
  }, [shopDomain, payload, from, to]);

  const showSkeleton = isLoading && !payload;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Revenue (Last 7 Days)</CardTitle>
          <CardDescription>{formatCurrency(chartData.total)} total</CardDescription>
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
          <DashboardPerformanceChart chartType={chartType} data={chartData.data} />
        )}
      </CardContent>
    </Card>
  );
}
