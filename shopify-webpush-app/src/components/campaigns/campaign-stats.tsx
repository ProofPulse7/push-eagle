
'use client';

import { useState, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings } from '@/context/settings-context';

type CampaignStatsResponse = {
    impressions: number;
    clicks: number;
    avgCtrPercent: number;
    revenueCents: number;
};

const StatSkeleton = () => (
    <div className="p-6">
        <Skeleton className="h-5 w-24 mb-2" />
        <Skeleton className="h-8 w-32" />
    </div>
);

export function CampaignStats({ date }: { date: DateRange | undefined }) {
    const { shopDomain } = useSettings();
    const [stats, setStats] = useState<CampaignStatsResponse | null>(null);

    useEffect(() => {
        const fetchStats = async () => {
            setStats(null);

            if (!shopDomain) {
                setStats({ impressions: 0, clicks: 0, avgCtrPercent: 0, revenueCents: 0 });
                return;
            }

            try {
                const params = new URLSearchParams({ shop: shopDomain });
                if (date?.from) {
                    params.set('from', date.from.toISOString());
                }
                if (date?.to) {
                    params.set('to', date.to.toISOString());
                }

                const response = await fetch(`/api/campaigns/stats?${params.toString()}`);
                const data = await response.json();

                if (!response.ok || !data?.ok) {
                    throw new Error(data?.error ?? 'Failed to load campaign stats.');
                }

                setStats({
                    impressions: Number(data.stats?.impressions ?? 0),
                    clicks: Number(data.stats?.clicks ?? 0),
                    avgCtrPercent: Number(data.stats?.avgCtrPercent ?? 0),
                    revenueCents: Number(data.stats?.revenueCents ?? 0),
                });
            } catch {
                setStats({ impressions: 0, clicks: 0, avgCtrPercent: 0, revenueCents: 0 });
            }
        };

        fetchStats();
    }, [date, shopDomain]);

    const statsData = stats
        ? [
              { label: 'Impressions', value: stats.impressions.toLocaleString() },
              { label: 'Clicks', value: stats.clicks.toLocaleString() },
              { label: 'Avg. CTR', value: `${stats.avgCtrPercent.toFixed(1)}%` },
              { label: 'Revenue generated', value: formatCurrency(stats.revenueCents / 100) },
          ]
        : null;

    return (
        <Card>
            <CardContent className="p-0">
               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x">
                    {statsData ? statsData.map((stat) => (
                       <div key={stat.label} className="p-6">
                            <p className="text-sm text-muted-foreground">{stat.label}</p>
                            <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                       </div>
                    )) : (
                        <>
                            <StatSkeleton />
                            <StatSkeleton />
                            <StatSkeleton />
                            <StatSkeleton />
                        </>
                    )}
               </div>
            </CardContent>
        </Card>
    );
}
