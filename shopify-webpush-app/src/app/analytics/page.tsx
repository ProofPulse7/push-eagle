
'use client';

import { useState, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { BarChart, DollarSign, MousePointerClick, TrendingUp, Users } from "lucide-react";
import type { LucideIcon } from 'lucide-react';

import { KpiCard } from "@/components/analytics/kpi-card";
import { PerformanceOverview } from "@/components/analytics/performance-overview";
import { RevenueAttribution } from "@/components/analytics/revenue-attribution";
import { TopCampaigns } from "@/components/analytics/top-campaigns";
import { TopAutomations } from "@/components/analytics/top-automations";
import { DevicePerformance } from "@/components/analytics/device-performance";
import { formatCurrency } from "@/lib/utils";
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings } from '@/context/settings-context';

type KpiItem = {
  title: string;
  value: string;
  change: string;
    icon: LucideIcon;
};

export default function AnalyticsPage() {
    const { shopDomain: settingsShop } = useSettings();
    const [queryShop, setQueryShop] = useState('');
    const shopDomain = queryShop || settingsShop || '';

    const [date, setDate] = useState<DateRange | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [kpis, setKpis] = useState<KpiItem[]>([]);

    useEffect(() => {
        setQueryShop(new URLSearchParams(window.location.search).get('shop') || '');
    }, []);

    useEffect(() => {
        if (!shopDomain) {
            setKpis([
                { title: "Total Revenue", value: formatCurrency(0), change: 'No shop connected', icon: DollarSign },
                { title: "New Subscribers", value: '0', change: 'No shop connected', icon: Users },
                { title: "Avg. Click Rate", value: '0%', change: 'No shop connected', icon: MousePointerClick },
                { title: "Total Impressions", value: '0', change: 'No shop connected', icon: TrendingUp },
            ]);
            setLoading(false);
            return;
        }

        let active = true;
        setLoading(true);

        const from = date?.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const to = date?.to ?? new Date();

        fetch(
            `/api/analytics/stats?shop=${encodeURIComponent(shopDomain)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
        )
            .then((res) => res.json())
            .then((payload) => {
                if (!active || !payload?.ok) return;
                const { kpis: k } = payload;
                setKpis([
                    {
                        title: "Total Revenue",
                        value: formatCurrency((k?.totalRevenueCents ?? 0) / 100),
                        change: `${k?.totalRevenueCents > 0 ? 'Revenue attributed via push' : 'No revenue yet'}`,
                        icon: DollarSign,
                    },
                    {
                        title: "New Subscribers",
                        value: `+${(k?.newSubscribers ?? 0).toLocaleString()}`,
                        change: 'In selected period',
                        icon: Users,
                    },
                    {
                        title: "Avg. Click Rate",
                        value: `${(k?.avgCtrPercent ?? 0).toFixed(1)}%`,
                        change: `${(k?.totalClicks ?? 0).toLocaleString()} total clicks`,
                        icon: MousePointerClick,
                    },
                    {
                        title: "Total Impressions",
                        value: (k?.totalImpressions ?? 0).toLocaleString(),
                        change: 'Campaigns + automations',
                        icon: TrendingUp,
                    },
                ]);
            })
            .catch(() => undefined)
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => { active = false; };
    }, [shopDomain, date]);

    if (loading) {
        return (
            <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
                <div className="flex items-center justify-between">
                    <div>
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-4 w-64 mt-2" />
                    </div>
                    <Skeleton className="h-10 w-60" />
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Skeleton className="h-28" />
                    <Skeleton className="h-28" />
                    <Skeleton className="h-28" />
                    <Skeleton className="h-28" />
                </div>
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                    <Skeleton className="h-96" />
                    <Skeleton className="h-96" />
                </div>
                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                    <Skeleton className="h-80" />
                    <Skeleton className="h-80" />
                </div>
                <Skeleton className="h-96" />
            </div>
        );
    }
    
    return (
        <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
                        <BarChart className="h-7 w-7" />
                        Analytics
                    </h1>
                    <p className="text-muted-foreground">Your central hub for performance metrics.</p>
                </div>
                <DateRangePicker date={date} setDate={setDate} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {kpis.map((kpi) => (
                    <KpiCard key={kpi.title} {...kpi} />
                ))}
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <PerformanceOverview dateRange={date} shopDomain={shopDomain} />
                <RevenueAttribution dateRange={date} shopDomain={shopDomain} />
            </div>
            
             <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <TopCampaigns dateRange={date} shopDomain={shopDomain} />
                <TopAutomations dateRange={date} shopDomain={shopDomain} />
            </div>

            <DevicePerformance dateRange={date} shopDomain={shopDomain} />
        </div>
    );
}
