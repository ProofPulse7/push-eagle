
'use client';

import { useMemo, useState, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { formatCurrency } from '@/lib/utils';
import { Button } from '../ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { addDays, eachDayOfInterval, eachMonthOfInterval, differenceInDays, format } from 'date-fns';
import { AreaChart as AreaChartIcon, BarChart3 } from 'lucide-react';
import { useAnalyticsStats } from '@/hooks/queries/use-app-queries';

const chartConfig = {
  revenue: {
    label: 'Revenue',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

const getXAxisProps = (dataCount: number) => {
    if (dataCount > 14) {
        return {
            angle: -90,
            textAnchor: 'end' as const,
            dy: 0,
            dx: -5,
            height: 50,
            interval: Math.floor(dataCount / 20) > 0 ? Math.floor(dataCount / 20) : 0,
        };
    }
    return { angle: 0, textAnchor: 'middle' as const, height: 30, interval: 0 };
};


export function PerformanceOverview({ dateRange, shopDomain }: { dateRange: DateRange | undefined; shopDomain?: string }) {
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const from = dateRange?.from ?? addDays(new Date(), -29);
  const to = dateRange?.to ?? new Date();
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

  if (!isClient) {
    return <Skeleton className="h-96 w-full" />;
  }

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
          <ChartContainer config={chartConfig} className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={chartData.data}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} {...getXAxisProps(chartData.data.length)} />
                  <YAxis tickFormatter={(v) => formatCurrency(v)} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
                </BarChart>
              ) : (
                <AreaChart data={chartData.data}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} {...getXAxisProps(chartData.data.length)} />
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
