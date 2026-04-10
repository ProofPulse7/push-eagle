'use client';

import { Line, LineChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

const chartData = [
  { hour: "0h", clicks: 28 },
  { hour: "2h", clicks: 95 },
  { hour: "4h", clicks: 150 },
  { hour: "6h", clicks: 120 },
  { hour: "8h", clicks: 90 },
  { hour: "10h", clicks: 75 },
  { hour: "12h", clicks: 60 },
  { hour: "14h", clicks: 50 },
  { hour: "16h", clicks: 45 },
  { hour: "18h", clicks: 40 },
  { hour: "20h", clicks: 35 },
  { hour: "22h", clicks: 30 },
];

const chartConfig = {
  clicks: {
    label: 'Clicks',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

export function PerformanceOverTimeChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Over Time</CardTitle>
        <CardDescription>Clicks in the first 24 hours after sending.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
            <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="dot" />}
                    />
                    <Line
                        dataKey="clicks"
                        type="monotone"
                        stroke="var(--color-clicks)"
                        strokeWidth={2}
                        dot={{
                            fill: "var(--color-clicks)",
                        }}
                        activeDot={{
                            r: 6,
                        }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
