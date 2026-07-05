'use client';

import { useMemo } from 'react';
import type { DateRange } from 'react-day-picker';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useCampaigns } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { aggregateCampaignListStats } from '@/lib/client/campaign-list-stats';

const StatSkeleton = () => (
    <div className="p-8">
        <Skeleton className="h-5 w-28 mb-3" />
        <Skeleton className="h-10 w-36" />
    </div>
);

export function CampaignStats({ date }: { date: DateRange | undefined }) {
    const shop = useShopDomain();
    const { data, isLoading } = useCampaigns();

    const stats = useMemo(() => {
      if (!shop) {
        return null;
      }

      const campaigns = Array.isArray(data?.campaigns)
        ? (data.campaigns as Record<string, unknown>[])
        : [];
      return aggregateCampaignListStats(campaigns, shop, date);
    }, [data?.campaigns, shop, date?.from?.getTime(), date?.to?.getTime()]);

    const statsData = [
        { label: 'Impressions', value: (stats?.impressions ?? 0).toLocaleString() },
        { label: 'Clicks', value: (stats?.clicks ?? 0).toLocaleString() },
        { label: 'Avg. CTR', value: `${(stats?.avgCtrPercent ?? 0).toFixed(1)}%` },
        { label: 'Revenue generated', value: formatCurrency((stats?.revenueCents ?? 0) / 100) },
    ];

    const showSkeleton = isLoading && !data;

    return (
        <Card className="border-border/80 shadow-sm">
            <CardContent className="p-0">
               <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 md:grid-cols-4 sm:divide-y-0 sm:divide-x">
                    {showSkeleton
                        ? Array.from({ length: 4 }).map((_, index) => <StatSkeleton key={index} />)
                        : statsData.map((stat) => (
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
