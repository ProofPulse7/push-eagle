'use client';

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency } from '@/lib/utils';

type DevicePoint = { device: string; value: number; fill: string };

const chartConfig = {
  value: { label: 'Value' },
  android: { label: 'Android', color: 'hsl(var(--chart-1))' },
  windows: { label: 'Windows', color: 'hsl(var(--chart-2))' },
  macos: { label: 'macOS', color: 'hsl(var(--chart-3))' },
  ios: { label: 'iOS', color: 'hsl(var(--chart-4))' },
} satisfies ChartConfig;

export default function DevicePerformanceCharts({
  data,
}: {
  data: {
    revenueData: DevicePoint[];
    subscribersData: DevicePoint[];
    clickRateData: DevicePoint[];
  };
}) {
  return (
    <Tabs defaultValue="subscribers">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="revenue">Revenue</TabsTrigger>
        <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
        <TabsTrigger value="click-rate">Distribution</TabsTrigger>
      </TabsList>
      <TabsContent value="revenue" className="mt-4">
        <p className="text-xs text-muted-foreground mb-2">Per-device revenue attribution coming soon.</p>
        <ChartContainer config={{ ...chartConfig, value: { label: 'Revenue' } }} className="h-64 w-full">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.revenueData} layout="vertical" margin={{ left: 10, right: 80 }}>
              <CartesianGrid horizontal={false} />
              <YAxis dataKey="device" type="category" tickLine={false} axisLine={false} tickMargin={10} className="font-medium" />
              <XAxis dataKey="value" type="number" hide />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" nameKey="value" formatter={(value) => formatCurrency(Number(value))} />} />
              <Bar dataKey="value" name="value" radius={5}>
                <LabelList dataKey="value" position="right" offset={8} className="fill-foreground text-sm" formatter={(value: number) => formatCurrency(value)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </TabsContent>
      <TabsContent value="subscribers" className="mt-4">
        <ChartContainer config={{ ...chartConfig, value: { label: 'Subscribers' } }} className="h-64 w-full">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.subscribersData} layout="vertical" margin={{ left: 10, right: 80 }}>
              <CartesianGrid horizontal={false} />
              <YAxis dataKey="device" type="category" tickLine={false} axisLine={false} tickMargin={10} className="font-medium" />
              <XAxis dataKey="value" type="number" hide />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" nameKey="value" formatter={(value) => Number(value).toLocaleString()} />} />
              <Bar dataKey="value" name="value" radius={5}>
                <LabelList dataKey="value" position="right" offset={8} className="fill-foreground text-sm" formatter={(value: number) => value.toLocaleString()} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </TabsContent>
      <TabsContent value="click-rate" className="mt-4">
        <ChartContainer config={{ ...chartConfig, value: { label: 'Distribution %' } }} className="h-64 w-full">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.clickRateData} layout="vertical" margin={{ left: 10, right: 80 }}>
              <CartesianGrid horizontal={false} />
              <YAxis dataKey="device" type="category" tickLine={false} axisLine={false} tickMargin={10} className="font-medium" />
              <XAxis dataKey="value" type="number" hide />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" nameKey="value" formatter={(value) => `${value}%`} />} />
              <Bar dataKey="value" name="value" radius={5}>
                <LabelList dataKey="value" position="right" offset={8} className="fill-foreground text-sm" formatter={(value: number) => `${value}%`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </TabsContent>
    </Tabs>
  );
}
