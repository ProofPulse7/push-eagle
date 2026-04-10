'use client';

import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency } from '@/lib/utils';

const generateData = () => {
    const revenueData = [
      { device: 'Android', value: Math.floor(Math.random() * 20000) + 10000, fill: 'var(--color-android)' },
      { device: 'Windows', value: Math.floor(Math.random() * 15000) + 8000, fill: 'var(--color-windows)' },
      { device: 'macOS', value: Math.floor(Math.random() * 12000) + 5000, fill: 'var(--color-macos)' },
      { device: 'iOS', value: Math.floor(Math.random() * 5000) + 2000, fill: 'var(--color-ios)' },
    ];
    const subscribersData = [
        { device: 'Android', value: Math.floor(Math.random() * 400000) + 300000, fill: 'var(--color-android)' },
        { device: 'Windows', value: Math.floor(Math.random() * 500000) + 400000, fill: 'var(--color-windows)' },
        { device: 'macOS', value: Math.floor(Math.random() * 200000) + 100000, fill: 'var(--color-macos)' },
        { device: 'iOS', value: Math.floor(Math.random() * 70000) + 30000, fill: 'var(--color-ios)' },
    ];
    const clickRateData = [
        { device: 'Android', value: parseFloat((Math.random() * 5 + 10).toFixed(1)), fill: 'var(--color-android)' },
        { device: 'Windows', value: parseFloat((Math.random() * 4 + 9).toFixed(1)), fill: 'var(--color-windows)' },
        { device: 'macOS', value: parseFloat((Math.random() * 4 + 10).toFixed(1)), fill: 'var(--color-macos)' },
        { device: 'iOS', value: parseFloat((Math.random() * 3 + 8).toFixed(1)), fill: 'var(--color-ios)' },
    ];
    return { revenueData, subscribersData, clickRateData };
}

const chartConfig = {
  value: { label: 'Value' },
  android: { label: 'Android', color: 'hsl(var(--chart-1))' },
  windows: { label: 'Windows', color: 'hsl(var(--chart-2))' },
  macos: { label: 'macOS', color: 'hsl(var(--chart-3))' },
  ios: { label: 'iOS', color: 'hsl(var(--chart-4))' },
} satisfies ChartConfig;

export function DevicePerformance({ dateRange }: { dateRange: DateRange | undefined }) {
  const [data, setData] = useState(generateData);

  useEffect(() => {
      setData(generateData());
  }, [dateRange]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Device Performance</CardTitle>
        <CardDescription>Breakdown of key metrics by subscriber device.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="revenue">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
            <TabsTrigger value="click-rate">Click Rate</TabsTrigger>
          </TabsList>
          <TabsContent value="revenue" className="mt-4">
            <ChartContainer config={{...chartConfig, value: {label: "Revenue"}}} className="h-64 w-full">
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.revenueData} layout="vertical" margin={{ left: 10, right: 80 }}>
                        <CartesianGrid horizontal={false} />
                        <YAxis dataKey="device" type="category" tickLine={false} axisLine={false} tickMargin={10} className="font-medium"/>
                        <XAxis dataKey="value" type="number" hide />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" nameKey="value" formatter={(value) => formatCurrency(Number(value))} />} />
                        <Bar dataKey="value" name="value" radius={5}>
                             <LabelList 
                                dataKey="value"
                                position="right" 
                                offset={8} 
                                className="fill-foreground text-sm" 
                                formatter={(value: number) => formatCurrency(value)} 
                            />
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
                        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" nameKey="value" formatter={(value) => value.toLocaleString()} />} />
                        <Bar dataKey="value" name="value" radius={5}>
                            <LabelList 
                                dataKey="value"
                                position="right" 
                                offset={8} 
                                className="fill-foreground text-sm" 
                                formatter={(value: number) => value.toLocaleString()} 
                            />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </ChartContainer>
          </TabsContent>
          <TabsContent value="click-rate" className="mt-4">
            <ChartContainer config={{...chartConfig, value: {label: "Click Rate"}}} className="h-64 w-full">
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.clickRateData} layout="vertical" margin={{ left: 10, right: 80 }}>
                        <CartesianGrid horizontal={false} />
                        <YAxis dataKey="device" type="category" tickLine={false} axisLine={false} tickMargin={10} className="font-medium" />
                        <XAxis dataKey="value" type="number" hide />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" nameKey="value" formatter={(value) => `${value}%`} />} />
                        <Bar dataKey="value" name="value" radius={5}>
                             <LabelList 
                                dataKey="value"
                                position="right" 
                                offset={8} 
                                className="fill-foreground text-sm" 
                                formatter={(value: number) => `${value}%`} 
                            />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </ChartContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
