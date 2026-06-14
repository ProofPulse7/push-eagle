
'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { differenceInDays, eachMonthOfInterval, format } from 'date-fns';
import { AreaChart as AreaChartIcon, BarChart3 } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker } from '../analytics/date-range-picker';
import { useSubscriberGrowth } from '@/hooks/queries/use-app-queries';

const DashboardSubscriberGrowthChart = dynamic(() => import('./dashboard-subscriber-growth-chart'), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full" />,
});

type GrowthPoint = {
  date: string;
  subscribers: number;
};

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

function buildChartData(
    payload: Record<string, unknown> | undefined,
    from: Date,
    to: Date,
): { data: GrowthPoint[]; total: number } {
    if (!payload?.ok) {
        return { data: [], total: 0 };
    }

    const rawPoints = Array.isArray(payload.points) ? payload.points : [];
    const pointDates = rawPoints
        .map((item: { date?: string }) => (item?.date ? new Date(item.date) : null))
        .filter((value: Date | null): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));

    const rangeDays =
        pointDates.length > 1
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

        return {
            data: monthPoints,
            total: monthPoints.reduce((sum, item) => sum + item.subscribers, 0),
        };
    }

    const normalized = rawPoints.map((item: { date?: string; subscribers?: number }) => {
        const parsedDate = item?.date ? new Date(item.date) : null;
        return {
            date:
                parsedDate && !Number.isNaN(parsedDate.getTime())
                    ? format(parsedDate, 'MMM d')
                    : 'Unknown',
            subscribers: Number(item?.subscribers ?? 0),
        };
    });

    return {
        data: normalized,
        total: Number(
            payload.totalNewSubscribers ??
                normalized.reduce((sum, item) => sum + item.subscribers, 0),
        ),
    };
}

export function SubscriberGrowthChart({
  showDatePicker = false,
  fullWidth = false,
  defaultDays = 7,
}: {
  showDatePicker?: boolean;
  fullWidth?: boolean;
  defaultDays?: number;
}) {
    const [date, setDate] = useState<DateRange | undefined>(undefined);
    const [chartType, setChartType] = useState<'area' | 'bar'>('area');

    const to = date?.to ?? new Date();
    const from = date?.from ?? new Date(to.getTime() - defaultDays * 24 * 60 * 60 * 1000);
    const { data: payload, isFetching, isLoading } = useSubscriberGrowth(from, to);

    const chartData = useMemo(() => buildChartData(payload, from, to), [payload, from, to]);
    const xAxisProps = getXAxisProps(chartData.data.length);
    const showRefreshing = isFetching && Boolean(payload);
    const showSkeleton = isLoading && !payload;

    return (
        <Card className={fullWidth ? 'shadow-sm' : undefined}>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle>Subscriber Growth</CardTitle>
                    <CardDescription>
                         {showDatePicker
                           ? 'New subscribers over the selected period.'
                           : `New subscribers over the last ${defaultDays} days.`}
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
                {showSkeleton ? (
                  <Skeleton className={fullWidth ? 'h-[28rem] w-full' : 'h-72 w-full'} />
                ) : (
                  <DashboardSubscriberGrowthChart
                    chartType={chartType}
                    data={chartData.data}
                    xAxisProps={xAxisProps}
                    height={fullWidth ? 420 : 288}
                  />
                )}
                {showRefreshing && <p className="text-xs text-muted-foreground mt-2">Refreshing growth data...</p>}
            </CardContent>
        </Card>
    );
}
