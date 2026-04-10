
'use client';

import { useState, useEffect } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { formatCurrency } from '@/lib/utils';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { addDays, eachDayOfInterval, format } from 'date-fns';
import { AreaChart as AreaChartIcon, BarChart3 } from 'lucide-react';

const generateData = () => {
    const from = addDays(new Date(), -6);
    const to = new Date();

    const data = eachDayOfInterval({ start: from, end: to }).map(day => ({
        date: format(day, 'MMM d'),
        revenue: Math.floor(Math.random() * 2000) + 500,
    }));

    const total = data.reduce((acc, item) => acc + item.revenue, 0);

    return { data, total };
};

const chartConfig = {
  revenue: {
    label: 'Revenue',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig;

export function PerformanceChart() {
    const [chartData, setChartData] = useState<{ data: any[], total: number }>({ data: [], total: 0 });
    const [chartType, setChartType] = useState<'bar' | 'area'>('bar');
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (isClient) {
            const { data, total } = generateData();
            setChartData({ data, total });
        }
    }, [isClient]);

    if (!isClient) {
        return <CardSkeleton />;
    }

    return (
        <Card>
            <CardHeader>
                <div>
                    <CardTitle>Performance Overview</CardTitle>
                    <CardDescription>Revenue over the last 7 days.</CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-bold">{formatCurrency(chartData.total)}</p>
                        <p className="text-sm text-muted-foreground">
                           Total Revenue
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-md bg-muted p-1">
                            <Button variant={chartType === 'area' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setChartType('area')}><AreaChartIcon className="h-4 w-4" /></Button>
                            <Button variant={chartType === 'bar' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setChartType('bar')}><BarChart3 className="h-4 w-4" /></Button>
                        </div>
                    </div>
                </div>

                <ChartContainer config={chartConfig} className="h-64 w-full">
                    {chartType === 'bar' ? (
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={chartData.data}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={10} tickFormatter={(value) => formatCurrency(value, true)} />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={4} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                         <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={chartData.data}>
                                <defs>
                                    <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.1} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="date" tickLine={false} tickMargin={10} axisLine={false} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={10} tickFormatter={(value) => formatCurrency(value, true)} />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                                <Area dataKey="revenue" type="monotone" stroke="var(--color-revenue)" strokeWidth={2} fillOpacity={1} fill="url(#fillRevenue)" dot={{ fill: "var(--color-revenue)", r: 2 }} activeDot={{ r: 6 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </ChartContainer>
            </CardContent>
        </Card>
    );
}

const CardSkeleton = () => (
    <Card>
        <CardHeader>
            <div>
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-64 mt-2" />
            </div>
        </CardHeader>
        <CardContent>
             <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-10 w-24" />
            </div>
            <Skeleton className="h-64 w-full" />
        </CardContent>
    </Card>
);
