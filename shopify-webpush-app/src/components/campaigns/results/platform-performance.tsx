'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

type PlatformPoint = {
  platform: string;
  clicks: number;
  fill?: string;
};

const chartConfig = {
  clicks: {
    label: 'Clicks',
  },
  android: {
    label: 'Android',
    color: 'hsl(var(--chart-1))',
  },
  windows: {
    label: 'Windows',
    color: 'hsl(var(--chart-2))',
  },
  macos: {
    label: 'macOS',
    color: 'hsl(var(--chart-3))',
  }
} satisfies ChartConfig;

export function PlatformPerformance({ data }: { data: PlatformPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Performance</CardTitle>
        <CardDescription>Total clicks broken down by platform.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
            <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid horizontal={false} />
                    <YAxis
                        dataKey="platform"
                        type="category"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                    />
                    <XAxis dataKey="clicks" type="number" hide />
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="dot" />}
                    />
                    <Bar dataKey="clicks" radius={5} />
                </BarChart>
            </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
