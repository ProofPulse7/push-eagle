
'use client';

import { useState, useEffect } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Area, AreaChart } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { differenceInDays, eachMonthOfInterval, format } from 'date-fns';
import { AreaChart as AreaChartIcon, BarChart3 } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker } from '../analytics/date-range-picker';
import { useSettings } from '@/context/settings-context';

type GrowthPoint = {
  date: string;
  subscribers: number;
};


const chartConfig = {
  subscribers: {
    label: 'New Subscribers',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig;

const getXAxisProps = (dataCount: number) => {
    if (dataCount > 14) {
        return {
            angle: -90,
            textAnchor: 'end' as const,
            dy: 0,
            dx: -5,
            height: 50,
            interval: Math.floor(dataCount / 20) > 0 ? Math.floor(dataCount / 20) : 0,
        };
    }
    return { angle: 0, textAnchor: 'middle' as const, height: 30, interval: 0 };
};


export function SubscriberGrowthChart({ showDatePicker = false }: { showDatePicker?: boolean }) {
    const { shopDomain } = useSettings();
    const [date, setDate] = useState<DateRange | undefined>(undefined);
    const [chartData, setChartData] = useState<{ data: GrowthPoint[]; total: number }>({ data: [], total: 0 });
    const [chartType, setChartType] = useState<'area' | 'bar'>('area');
    const [isClient, setIsClient] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!isClient || !shopDomain) {
            return;
        }

        const to = date?.to ?? new Date();
        const from = date?.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

        let active = true;
        setIsLoading(true);

        fetch(`/api/subscribers/growth?shop=${encodeURIComponent(shopDomain)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
            .then((response) => response.json())
            .then((payload) => {
                if (!active || !payload?.ok) {
                    return;
                }

                const rawPoints = Array.isArray(payload.points) ? payload.points : [];
                const pointDates = rawPoints
                    .map((item: { date?: string }) => (item?.date ? new Date(item.date) : null))
                    .filter((value: Date | null): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));

                const rangeDays = pointDates.length > 1
                    ? differenceInDays(pointDates[pointDates.length - 1], pointDates[0])
                    : 0;

                if (rangeDays > 90) {
                    const monthly = new Map<string, number>();
                    for (const item of rawPoints) {
                        const day = item?.date ? new Date(item.date) : null;
                        if (!day || Number.isNaN(day.getTime())) {
                            continue;
                        }
                        const label = format(day, 'MMM yy');
                        monthly.set(label, (monthly.get(label) ?? 0) + Number(item?.subscribers ?? 0));
                    }

                    const interval = eachMonthOfInterval({ start: from, end: to });
                    const monthPoints = interval.map((month) => {
                        const label = format(month, 'MMM yy');
                        return {
                            date: label,
                            subscribers: monthly.get(label) ?? 0,
                        };
                    });

                    setChartData({
                        data: monthPoints,
                        total: monthPoints.reduce((sum, item) => sum + item.subscribers, 0),
                    });
                    return;
                }

                const normalized = rawPoints.map((item: { date?: string; subscribers?: number }) => {
                    const parsedDate = item?.date ? new Date(item.date) : null;
                    return {
                        date: parsedDate && !Number.isNaN(parsedDate.getTime()) ? format(parsedDate, 'MMM d') : 'Unknown',
                        subscribers: Number(item?.subscribers ?? 0),
                    };
                });

                setChartData({
                    data: normalized,
                    total: Number(payload.totalNewSubscribers ?? normalized.reduce((sum: number, item: { subscribers: number }) => sum + item.subscribers, 0)),
                });
            })
            .catch(() => undefined)
            .finally(() => {
                if (active) {
                    setIsLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [isClient, shopDomain, date]);

    const xAxisProps = getXAxisProps(chartData.data.length);

    if (!isClient) {
        return <CardSkeleton />;
    }
    
    return (
        <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle>Subscriber Growth</CardTitle>
                    <CardDescription>
                         {showDatePicker ? "New subscribers over the selected period." : "New subscribers over the last 7 days."}
                    </CardDescription>
                </div>
                 {showDatePicker && <DateRangePicker date={date} setDate={setDate} size="sm" />}
            </CardHeader>
            <CardContent>
                 <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-bold">+{chartData.total.toLocaleString()}</p>
                         <p className="text-sm text-muted-foreground">
                            Total New Subscribers
                        </p>
                    </div>
                     <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-md bg-muted p-1">
                            <Button variant={chartType === 'area' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setChartType('area')}><AreaChartIcon className="h-4 w-4" /></Button>
                            <Button variant={chartType === 'bar' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" onClick={() => setChartType('bar')}><BarChart3 className="h-4 w-4" /></Button>
                        </div>
                    </div>
                </div>
                <ChartContainer config={chartConfig} className="h-72 w-full">
                    {chartType === 'bar' ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={chartData.data}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="date" tickLine={false} axisLine={false} {...xAxisProps} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={10} />
                                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                                <Bar dataKey="subscribers" fill="var(--color-subscribers)" radius={4} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <ResponsiveContainer width="100%" height={280}>
                            <AreaChart data={chartData.data}>
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
                                <Area dataKey="subscribers" type="monotone" stroke="var(--color-subscribers)" strokeWidth={2} fillOpacity={1} fill="url(#fillSubscribers)" dot={{ fill: "var(--color-subscribers)", r: 2 }} activeDot={{ r: 6 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </ChartContainer>
                {isLoading && <p className="text-xs text-muted-foreground mt-2">Refreshing growth data...</p>}
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
