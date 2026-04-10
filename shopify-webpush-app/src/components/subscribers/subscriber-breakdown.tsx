
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

const osData = [
  { name: 'Android', value: 377193, color: 'var(--color-android)' },
  { name: 'Windows', value: 565789, color: 'var(--color-windows)' },
  { name: 'macOS', value: 251462, color: 'var(--color-macos)' },
  { name: 'iOS', value: 62865, color: 'var(--color-ios)' },
  { name: 'Linux', value: 12573, color: 'var(--color-linux)' },
];

const browserData = [
  { name: 'Chrome', value: 817251, color: 'var(--color-chrome)' },
  { name: 'Safari', value: 188596, color: 'var(--color-safari)' },
  { name: 'Firefox', value: 125731, color: 'var(--color-firefox)' },
  { name: 'Edge', value: 125731, color: 'var(--color-edge)' },
  { name: 'Opera', value: 25146, color: 'var(--color-opera)' },
];

const chartConfig = {
  windows: { label: 'Windows', color: 'hsl(var(--chart-2))' },
  android: { label: 'Android', color: 'hsl(var(--chart-1))' },
  macos: { label: 'macOS', color: 'hsl(var(--chart-3))' },
  ios: { label: 'iOS', color: 'hsl(var(--chart-4))' },
  linux: { label: 'Linux', color: 'hsl(var(--chart-5))' },
  others: { label: 'Others', color: 'hsl(var(--muted-foreground))' },
  chrome: { label: 'Chrome', color: 'hsl(var(--chart-1))' },
  safari: { label: 'Safari', color: 'hsl(var(--chart-2))' },
  firefox: { label: 'Firefox', color: 'hsl(var(--chart-3))' },
  edge: { label: 'Edge', color: 'hsl(var(--chart-4))' },
  opera: { label: 'Opera', color: 'hsl(var(--chart-5))' },
};

const addOthersCategory = (data: { name: string; value: number; color: string }[]) => {
    if (data.length <= 4) return data;
    const top4 = data.slice(0, 4);
    const othersTotal = data.slice(4).reduce((acc, curr) => acc + curr.value, 0);
    return [
        ...top4,
        { name: 'Others', value: othersTotal, color: 'hsl(var(--muted-foreground))' },
    ];
};

const processedOsData = addOthersCategory(osData);
const processedBrowserData = addOthersCategory(browserData);

const BreakdownList = ({ data }: { data: typeof processedOsData | typeof processedBrowserData }) => {
    const total = data.reduce((acc, curr) => acc + curr.value, 0);

    return (
        <div className="space-y-4">
            {data.map((item) => {
                const percentage = total > 0 ? (item.value / total) * 100 : 0;
                const configKey = item.name.toLowerCase().replace(/\s/g, '-') as keyof typeof chartConfig;
                const color = chartConfig[configKey]?.color || item.color || 'hsl(var(--primary))';
                return (
                    <div key={item.name} className="space-y-1">
                        <div className="flex justify-between items-center text-sm">
                            <span className="font-medium text-muted-foreground">{item.name}</span>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">{formatNumber(item.value)}</span>
                                <span className="text-xs text-muted-foreground">({percentage.toFixed(1)}%)</span>
                            </div>
                        </div>
                        <Progress value={percentage} indicatorClassName="bg-[var(--color)]" style={{ '--color': color } as React.CSSProperties} />
                    </div>
                );
            })}
        </div>
    );
};

export function SubscriberBreakdown() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Platform Breakdown</CardTitle>
        <CardDescription>Distribution across platforms and browsers.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="browser">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="browser">Browser</TabsTrigger>
                <TabsTrigger value="os">Operating System</TabsTrigger>
            </TabsList>
            <TabsContent value="os" className="mt-6">
                <BreakdownList data={processedOsData} />
            </TabsContent>
            <TabsContent value="browser" className="mt-6">
                <BreakdownList data={processedBrowserData} />
            </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Add this to your ui/progress.tsx if it doesn't support custom indicator colors
declare module "react" {
  interface CSSProperties {
    "--color"?: string
  }
}
