'use client';

import type { DateRange } from 'react-day-picker';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaignStats } from '@/hooks/queries/use-app-queries';

const StatSkeleton = () => (
    <div className="p-6">
        <Skeleton className="h-5 w-24 mb-2" />
        <Skeleton className="h-8 w-32" />
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
        <Card>
            <CardContent className="p-0">
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x">
                    {showSkeleton
                        ? Array.from({ length: 4 }).map((_, index) => <StatSkeleton key={index} />)
                        : statsData?.map((stat) => (
                              <div key={stat.label} className="p-6">
                                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                                  <p className="text-2xl font-bold mt-1">{stat.value}</p>
                              </div>
                          ))}
               </div>
            </CardContent>
        </Card>
    );
}
