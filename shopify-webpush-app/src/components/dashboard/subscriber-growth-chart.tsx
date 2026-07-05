
'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { endOfDay, startOfDay } from 'date-fns';
import { AreaChart as AreaChartIcon, BarChart3 } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { DateRangePicker } from '../analytics/date-range-picker';
import { useSubscriberGrowth } from '@/hooks/queries/use-app-queries';
import { buildSubscriberGrowthChartData } from '@/lib/client/subscriber-growth-series';
import { resolveAnalyticsDateRange } from '@/lib/client/analytics-date-range';
import { formatCampaignDateRangeLabel } from '@/lib/client/campaign-date-range-label';

const DashboardSubscriberGrowthChart = dynamic(() => import('./dashboard-subscriber-growth-chart'), {
  ssr: false,
  loading: () => null,
});

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

    const { queryFrom, queryTo, chartFrom, chartTo, periodLabel } = useMemo(() => {
        const defaultRange = () => {
            const toDate = endOfDay(new Date());
            const fromDate = startOfDay(new Date(Date.now() - defaultDays * 24 * 60 * 60 * 1000));
            return {
                queryFrom: fromDate,
                queryTo: toDate,
                chartFrom: fromDate,
                chartTo: toDate,
                periodLabel: `the last ${defaultDays} days`,
            };
        };

        if (showDatePicker) {
            if (!date?.from) {
                return defaultRange();
            }

            const range = resolveAnalyticsDateRange(date);
            return {
                queryFrom: range.from,
                queryTo: range.to,
                chartFrom: range.from,
                chartTo: range.to,
                periodLabel: formatCampaignDateRangeLabel(date),
            };
        }

        return defaultRange();
    }, [showDatePicker, date?.from?.getTime(), date?.to?.getTime(), defaultDays]);

    const { data: payload, isLoading } = useSubscriberGrowth(queryFrom, queryTo);

    const resolvedChartFrom = chartFrom;
    const resolvedChartTo = chartTo;

    const chartData = useMemo(
        () => buildSubscriberGrowthChartData(payload, resolvedChartFrom, resolvedChartTo),
        [payload, resolvedChartFrom.getTime(), resolvedChartTo.getTime()],
    );
    const xAxisProps = getXAxisProps(chartData.data.length);
    const showSkeleton = isLoading && !payload;
    const periodSummaryLabel = showDatePicker
      ? formatCampaignDateRangeLabel(date)
      : `Last ${defaultDays} days`;

    return (
        <Card className={fullWidth ? 'border-border/80 shadow-sm' : 'border-border/80'}>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle>Subscriber Growth</CardTitle>
                    <CardDescription>
                         New subscribers for {periodLabel}.
                    </CardDescription>
                </div>
                 {showDatePicker && <DateRangePicker date={date} setDate={setDate} size="sm" />}
            </CardHeader>
            <CardContent>
                 <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
                    <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-bold">+{chartData.total.toLocaleString()}</p>
                         <p className="text-sm text-muted-foreground">
                            New subscribers · {periodSummaryLabel}
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
            </CardContent>
        </Card>
    );
}
