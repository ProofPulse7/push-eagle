'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const chartConfig = {
  subscribers: {
    label: 'New Subscribers',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

type GrowthPoint = {
  date: string;
  subscribers: number;
};

export default function DashboardSubscriberGrowthChart({
  chartType,
  data,
  xAxisProps,
  height = 280,
}: {
  chartType: 'area' | 'bar';
  data: GrowthPoint[];
  xAxisProps: Record<string, unknown>;
  height?: number;
}) {
  return (
    <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
      {chartType === 'bar' ? (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} {...xAxisProps} />
            <YAxis tickLine={false} axisLine={false} tickMargin={10} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Bar dataKey="subscribers" fill="var(--color-subscribers)" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillSubscribers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-subscribers)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-subscribers)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} {...xAxisProps} />
            <YAxis tickLine={false} axisLine={false} tickMargin={10} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Area
              dataKey="subscribers"
              type="monotone"
              stroke="var(--color-subscribers)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#fillSubscribers)"
              dot={{ fill: 'var(--color-subscribers)', r: 2 }}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartContainer>
  );
}
