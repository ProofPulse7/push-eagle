'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { formatCurrency } from '@/lib/utils';

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

export default function PerformanceOverviewChart({
  chartType,
  data,
}: {
  chartType: 'bar' | 'area';
  data: Array<{ date: string; revenue: number }>;
}) {
  return (
    <ChartContainer config={chartConfig} className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {chartType === 'bar' ? (
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} {...getXAxisProps(data.length)} />
            <YAxis tickFormatter={(v) => formatCurrency(v)} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
            <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
          </BarChart>
        ) : (
          <AreaChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} {...getXAxisProps(data.length)} />
            <YAxis tickFormatter={(v) => formatCurrency(v)} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
            <Area type="monotone" dataKey="revenue" fill="var(--color-revenue)" stroke="var(--color-revenue)" />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </ChartContainer>
  );
}
