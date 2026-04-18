
'use client';

import { Pie, PieChart, ResponsiveContainer, Cell, Text } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { formatCurrency } from '@/lib/utils';
import { useState, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';


const emptyData = [
  { source: 'campaigns', revenue: 0, fill: 'var(--color-campaigns)' },
  { source: 'automations', revenue: 0, fill: 'var(--color-automations)' },
];

const chartConfig = {
  revenue: {
    label: 'Revenue',
  },
  campaigns: {
    label: 'Campaigns',
    color: 'hsl(var(--chart-1))',
  },
  automations: {
    label: 'Automations',
    color: 'hsl(var(--chart-2))',
  },
} satisfies ChartConfig;

// Custom label for the pie chart slices
const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}) => {
  const RADIAN = Math.PI / 180;
  // A bit of tweaking to position the label inside the slice
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-base font-bold"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};


export function RevenueAttribution({ dateRange, shopDomain }: { dateRange: DateRange | undefined; shopDomain?: string }) {
  const [data, setData] = useState<typeof emptyData>(emptyData);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !shopDomain) return;

    const from = dateRange?.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = dateRange?.to ?? new Date();

    fetch(
      `/api/analytics/stats?shop=${encodeURIComponent(shopDomain)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    )
      .then((res) => res.json())
      .then((payload) => {
        if (!payload?.ok) return;
        setData([
          { source: 'campaigns', revenue: (payload.attribution?.campaignRevenueCents ?? 0) / 100, fill: 'var(--color-campaigns)' },
          { source: 'automations', revenue: (payload.attribution?.automationRevenueCents ?? 0) / 100, fill: 'var(--color-automations)' },
        ]);
      })
      .catch(() => undefined);
  }, [isClient, shopDomain, dateRange]);

  if (!isClient || data.length === 0) {
    return (
      <Card className="flex flex-col h-full">
        <CardHeader>
          <CardTitle>Revenue Attribution</CardTitle>
          <CardDescription>Revenue from manual campaigns vs. automated flows.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col items-center justify-center relative">
          <div className="mx-auto aspect-square w-full max-w-[250px] flex items-center justify-center">
            <Skeleton className="h-full w-full rounded-full" />
          </div>
        </CardContent>
        <CardContent className="flex flex-col gap-3 text-sm pt-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Separator className="my-2" />
          <div className='flex justify-between'>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalRevenue = data.reduce((acc, curr) => acc + curr.revenue, 0);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>Revenue Attribution</CardTitle>
        <CardDescription>Revenue from manual campaigns vs. automated flows.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center relative pt-0 pb-4">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square w-full max-w-[250px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Pie
                data={data}
                dataKey="revenue"
                nameKey="source"
                innerRadius={50}
                outerRadius={110}
                paddingAngle={2}
                strokeWidth={2}
                labelLine={false}
                label={renderCustomizedLabel}
              >
                {data.map((entry) => (
                    <Cell key={entry.source} fill={entry.fill} className="outline-none" />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
      <CardContent className="flex flex-col gap-3 text-sm pt-4 mt-auto">
        {data.map((entry) => {
          const percentage =
            totalRevenue > 0 ? (entry.revenue / totalRevenue) * 100 : 0;
          return (
            <div
              key={entry.source}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.fill }}
                />
                <span className="capitalize text-muted-foreground">
                  {entry.source}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <p className="font-medium text-foreground">
                  {formatCurrency(entry.revenue)}
                </p>
                <p className="w-12 text-right font-medium text-muted-foreground">
                  {percentage.toFixed(1)}%
                </p>
              </div>
            </div>
          );
        })}
        <Separator className="my-2" />
        <div className="flex items-center justify-between font-bold">
          <span>Total Revenue</span>
          <span>{formatCurrency(totalRevenue)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
