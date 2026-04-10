
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from '../ui/progress';

const topCountriesData = [
  { name: 'Pakistan', value: 450123 },
  { name: 'United States', value: 380987 },
  { name: 'United Kingdom', value: 210456 },
  { name: 'Germany', value: 150765 },
  { name: 'Canada', value: 98543 },
];

const topCitiesData = [
  { name: 'Karachi', value: 210987 },
  { name: 'New York', value: 180123 },
  { name: 'London', value: 150456 },
  { name: 'Munich', value: 98765 },
  { name: 'Toronto', value: 76543 },
];

const chartConfig = {
    pakistan: { color: 'hsl(var(--chart-1))' },
    'united-states': { color: 'hsl(var(--chart-2))' },
    'united-kingdom': { color: 'hsl(var(--chart-3))' },
    germany: { color: 'hsl(var(--chart-4))' },
    canada: { color: 'hsl(var(--chart-5))' },
    karachi: { color: 'hsl(var(--chart-1))' },
    'new-york': { color: 'hsl(var(--chart-2))' },
    london: { color: 'hsl(var(--chart-3))' },
    munich: { color: 'hsl(var(--chart-4))' },
    toronto: { color: 'hsl(var(--chart-5))' },
    others: { color: 'hsl(var(--muted-foreground))' }
};


const addOthersCategory = (data: { name: string; value: number }[]) => {
    if (data.length <= 4) return data;
    const top4 = data.slice(0, 4);
    const othersTotal = data.slice(4).reduce((acc, curr) => acc + curr.value, 0);
    return [
        ...top4,
        { name: 'Others', value: othersTotal },
    ];
};

const processedCountriesData = addOthersCategory(topCountriesData);
const processedCitiesData = addOthersCategory(topCitiesData);

const BreakdownList = ({ data }: { data: { name: string, value: number }[] }) => {
    const total = data.reduce((acc, curr) => acc + curr.value, 0);

    return (
        <div className="space-y-4">
            {data.map((item) => {
                const percentage = total > 0 ? (item.value / total) * 100 : 0;
                const configKey = item.name.toLowerCase().replace(/\s/g, '-') as keyof typeof chartConfig;
                const color = chartConfig[configKey]?.color || 'hsl(var(--primary))';
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


export function GeolocationChart() {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Location Breakdown</CardTitle>
        <CardDescription>Subscribers by city or country.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="city">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="city">Top Cities</TabsTrigger>
                <TabsTrigger value="country">Top Countries</TabsTrigger>
            </TabsList>
            <TabsContent value="country" className="mt-6">
                <BreakdownList data={processedCountriesData} />
            </TabsContent>
            <TabsContent value="city" className="mt-6">
                <BreakdownList data={processedCitiesData} />
            </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
