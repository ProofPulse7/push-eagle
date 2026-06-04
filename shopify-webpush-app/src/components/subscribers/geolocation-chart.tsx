
'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '../ui/progress';
import { useSubscribersOverview } from '@/hooks/queries/use-app-queries';
import { Skeleton } from '@/components/ui/skeleton';

type LocationItem = { name: string; value: number };

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


const addOthersCategory = (data: LocationItem[]) => {
    if (data.length <= 4) return data;
    const top4 = data.slice(0, 4);
    const othersTotal = data.slice(4).reduce((acc, curr) => acc + curr.value, 0);
    return [
        ...top4,
        { name: 'Others', value: othersTotal },
    ];
};

const BreakdownList = ({ data }: { data: LocationItem[] }) => {
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
    const { data, isLoading } = useSubscribersOverview();

    const countries = useMemo(() => {
        if (!data?.ok) return [];
        const nextCountries = Array.isArray(data.countries) ? data.countries : [];
        return nextCountries.map((item: { name: string; value: number }) => ({
            name: item.name,
            value: Number(item.value ?? 0),
        }));
    }, [data]);

    const cities = useMemo(() => {
        if (!data?.ok) return [];
        const nextCities = Array.isArray(data.cities) ? data.cities : [];
        return nextCities.map((item: { name: string; value: number }) => ({
            name: item.name,
            value: Number(item.value ?? 0),
        }));
    }, [data]);

    const processedCountriesData = useMemo(() => addOthersCategory(countries), [countries]);
    const processedCitiesData = useMemo(() => addOthersCategory(cities), [cities]);

    if (isLoading && !data) {
        return <Skeleton className="h-64 w-full" />;
    }

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
