
'use client';

import { useMemo, useState, useEffect } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { formatCurrency } from '@/lib/utils';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { format, eachDayOfInterval, addDays } from 'date-fns';
import { AreaChart as AreaChartIcon, BarChart3 } from 'lucide-react';
import { useAnalyticsStats } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';

const chartConfig = {
  revenue: {
    label: 'Revenue',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

export function PerformanceChart() {
  const shopDomain = useShopDomain();
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

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

  if (!isClient) {
    return <Skeleton className="h-80 w-full" />;
  }

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
          <ChartContainer config={chartConfig} className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={chartData.data}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
                </BarChart>
              ) : (
                <AreaChart data={chartData.data}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                  <Area type="monotone" dataKey="revenue" fill="var(--color-revenue)" stroke="var(--color-revenue)" />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
