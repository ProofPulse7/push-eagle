'use client';

import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';

type DevicePoint = { device: string; value: number; fill: string };

const DEVICES = ['android', 'windows', 'macos', 'ios'];
const FILLS: Record<string, string> = {
  android: 'var(--color-android)',
  windows: 'var(--color-windows)',
  macos: 'var(--color-macos)',
  ios: 'var(--color-ios)',
};

const emptyData = (): { revenueData: DevicePoint[]; subscribersData: DevicePoint[]; clickRateData: DevicePoint[] } => ({
  revenueData: DEVICES.map((d) => ({ device: d.charAt(0).toUpperCase() + d.slice(1), value: 0, fill: FILLS[d] })),
  subscribersData: DEVICES.map((d) => ({ device: d.charAt(0).toUpperCase() + d.slice(1), value: 0, fill: FILLS[d] })),
  clickRateData: DEVICES.map((d) => ({ device: d.charAt(0).toUpperCase() + d.slice(1), value: 0, fill: FILLS[d] })),
});

const chartConfig = {
  value: { label: 'Value' },
  android: { label: 'Android', color: 'hsl(var(--chart-1))' },
  windows: { label: 'Windows', color: 'hsl(var(--chart-2))' },
  macos: { label: 'macOS', color: 'hsl(var(--chart-3))' },
  ios: { label: 'iOS', color: 'hsl(var(--chart-4))' },
} satisfies ChartConfig;

export function DevicePerformance({ dateRange, shopDomain }: { dateRange: DateRange | undefined; shopDomain?: string }) {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shopDomain) {
      setData(emptyData());
      return;
    }

    let active = true;
    setLoading(true);

    fetch(`/api/subscribers/overview?shop=${encodeURIComponent(shopDomain)}`)
      .then((res) => res.json())
      .then((payload) => {
        if (!active || !payload?.ok) return;

        const platforms: Array<{ name: string; count: number }> = payload.platforms ?? [];
        const total = platforms.reduce((acc, p) => acc + p.count, 0);

        const subsData = DEVICES.map((d) => {
          const match = platforms.find((p) => p.name?.toLowerCase().includes(d === 'macos' ? 'mac' : d));
          return { device: d.charAt(0).toUpperCase() + d.slice(1), value: match?.count ?? 0, fill: FILLS[d] };
        });

        const ctrData = DEVICES.map((d) => {
          const match = platforms.find((p) => p.name?.toLowerCase().includes(d === 'macos' ? 'mac' : d));
          const pct = total > 0 ? ((match?.count ?? 0) / total) * 100 : 0;
          return { device: d.charAt(0).toUpperCase() + d.slice(1), value: parseFloat(pct.toFixed(1)), fill: FILLS[d] };
        });

        setData({ revenueData: emptyData().revenueData, subscribersData: subsData, clickRateData: ctrData });
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [shopDomain, dateRange]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Device Performance</CardTitle>
        <CardDescription>Breakdown of key metrics by subscriber device.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Tabs defaultValue="subscribers">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="revenue">Revenue</TabsTrigger>
              <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
              <TabsTrigger value="click-rate">Distribution</TabsTrigger>
            </TabsList>
            <TabsContent value="revenue" className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">Per-device revenue attribution coming soon.</p>
              <ChartContainer config={{...chartConfig, value: {label: "Revenue"}}} className="h-64 w-full">
                  <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={data.revenueData} layout="vertical" margin={{ left: 10, right: 80 }}>
                          <CartesianGrid horizontal={false} />
                          <YAxis dataKey="device" type="category" tickLine={false} axisLine={false} tickMargin={10} className="font-medium"/>
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
               <ChartContainer config={{...chartConfig, value: {label: "Subscribers"}}} className="h-64 w-full">
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
              <ChartContainer config={{...chartConfig, value: {label: "Distribution %"}}} className="h-64 w-full">
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
        )}
      </CardContent>
    </Card>
  );
}
