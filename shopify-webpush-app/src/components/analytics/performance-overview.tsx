
'use client';

import { useState, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { formatCurrency } from '@/lib/utils';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { addDays, eachDayOfInterval, format, differenceInDays, eachMonthOfInterval } from 'date-fns';
import { AreaChart as AreaChartIcon, BarChart3 } from 'lucide-react';

const generateData = (dateRange: DateRange | undefined) => {
  const from = dateRange?.from ?? addDays(new Date(), -29);
  const to = dateRange?.to ?? new Date();

  if (from > to) return { data: [], total: 0 };

  const daysDiff = differenceInDays(to, from);
  let data;

  if (daysDiff > 90) {
      const months = eachMonthOfInterval({ start: from, end: to });
      data = months.map(month => ({
          date: format(month, 'MMM yy'),
          revenue: Math.floor(Math.random() * 50000) + 20000,
      }));
  } else {
      const days = eachDayOfInterval({ start: from, end: to });
      data = days.map(day => ({
        date: format(day, 'MMM d'),
        revenue: Math.floor(Math.random() * 5000) + 1000,
      }));
  }

  const total = data.reduce((acc, item) => acc + item.revenue, 0);
  return { data, total };
};

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


export function PerformanceOverview({ dateRange }: { dateRange: DateRange | undefined }) {
  const [chartData, setChartData] = useState<{ data: any[], total: number }>({ data: [], total: 0 });
  const [isClient, setIsClient] = useState(false);
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient) {
      const timer = setTimeout(() => {
        setChartData(generateData(dateRange));
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [dateRange, isClient]);

  const xAxisProps = getXAxisProps(chartData.data.length);

  if (!isClient) {
      return (
        <Card className="flex flex-col h-full">
            <CardHeader>
                <CardTitle>Performance Overview</CardTitle>
                <CardDescription>Revenue over the selected period.</CardDescription>
            </CardHeader>
            <CardContent className="pb-4 flex-1">
                 <Skeleton className="w-full h-full min-h-[250px]" />
            </CardContent>
        </Card>
      )
  }

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>Performance Overview</CardTitle>
        <CardDescription>Revenue over the selected period.</CardDescription>
      </CardHeader>
      <CardContent className="pb-4 flex-1 flex flex-col">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold">{formatCurrency(chartData.total)}</p>
            <p className="text-sm text-muted-foreground">
              Total Revenue
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-md bg-muted p-1">
              <Button variant={chartType === 'area' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setChartType('area')}><AreaChartIcon className="h-4 w-4" /></Button>
              <Button variant={chartType === 'bar' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setChartType('bar')}><BarChart3 className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
        <div className="flex-1">
            <ChartContainer config={chartConfig} className="h-full w-full">
                {chartType === 'bar' ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData.data}>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            {...xAxisProps}
                        />
                        <YAxis
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                            tickFormatter={(value) => formatCurrency(value, true)}
                        />
                        <ChartTooltip
                            cursor={false}
                            content={<ChartTooltipContent indicator="dot" />}
                        />
                        <Bar
                            dataKey="revenue"
                            fill="var(--color-revenue)"
                            radius={4}
                        />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                     <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData.data}>
                            <defs>
                                <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                                    <stop
                                        offset="5%"
                                        stopColor="var(--color-revenue)"
                                        stopOpacity={0.8}
                                    />
                                    <stop
                                        offset="95%"
                                        stopColor="var(--color-revenue)"
                                        stopOpacity={0.1}
                                    />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickLine={false}
                                axisLine={false}
                                {...xAxisProps}
                            />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickMargin={10}
                                tickFormatter={(value) => formatCurrency(value, true)}
                            />
                            <ChartTooltip
                                cursor={false}
                                content={<ChartTooltipContent indicator="dot" />}
                            />
                            <Area
                                dataKey="revenue"
                                type="monotone"
                                stroke="var(--color-revenue)"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#fillRevenue)"
                                 dot={{
                                    fill: "var(--color-revenue)",
                                    r: 2,
                                }}
                                activeDot={{
                                    r: 6,
                                }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
