'use client';

import type { DateRange } from 'react-day-picker';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaignStats } from '@/hooks/queries/use-app-queries';

const StatSkeleton = () => (
    <div className="p-8">
        <Skeleton className="h-5 w-28 mb-3" />
        <Skeleton className="h-10 w-36" />
    </div>
);

export function CampaignStats({ date }: { date: DateRange | undefined }) {
    const { data, isLoading } = useCampaignStats(date?.from, date?.to);

    const statsPayload =
        data && typeof data.stats === 'object' && data.stats !== null
            ? (data.stats as Record<string, unknown>)
            : null;

    const stats = statsPayload
        ? {
              impressions: Number(statsPayload.impressions ?? 0),
              clicks: Number(statsPayload.clicks ?? 0),
              avgCtrPercent: Number(statsPayload.avgCtrPercent ?? 0),
              revenueCents: Number(statsPayload.revenueCents ?? 0),
          }
        : data
          ? { impressions: 0, clicks: 0, avgCtrPercent: 0, revenueCents: 0 }
          : null;

    const statsData = stats
        ? [
              { label: 'Impressions', value: stats.impressions.toLocaleString() },
              { label: 'Clicks', value: stats.clicks.toLocaleString() },
              { label: 'Avg. CTR', value: `${stats.avgCtrPercent.toFixed(1)}%` },
              { label: 'Revenue generated', value: formatCurrency(stats.revenueCents / 100) },
          ]
        : null;

    const showSkeleton = isLoading && !data;

    return (
        <Card className="border-border/80 shadow-sm">
            <CardContent className="p-0">
               <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 md:grid-cols-4 sm:divide-y-0 sm:divide-x">
                    {showSkeleton
                        ? Array.from({ length: 4 }).map((_, index) => <StatSkeleton key={index} />)
                        : statsData?.map((stat) => (
                              <div key={stat.label} className="p-8">
                                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                                  <p className="text-4xl font-bold mt-2 tracking-tight">{stat.value}</p>
                              </div>
                          ))}
               </div>
            </CardContent>
        </Card>
    );
}
