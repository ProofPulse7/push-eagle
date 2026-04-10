
'use client';

import React, { useState, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { BarChart, DollarSign, MousePointerClick, TrendingUp, Users } from "lucide-react";

import { KpiCard } from "@/components/analytics/kpi-card";
import { PerformanceOverview } from "@/components/analytics/performance-overview";
import { RevenueAttribution } from "@/components/analytics/revenue-attribution";
import { TopCampaigns } from "@/components/analytics/top-campaigns";
import { TopAutomations } from "@/components/analytics/top-automations";
import { DevicePerformance } from "@/components/analytics/device-performance";
import { formatCurrency } from "@/lib/utils";
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { Skeleton } from '@/components/ui/skeleton';


const generateKpiData = () => {
    return [
        { title: "Total Revenue", value: formatCurrency(Math.random() * 50000), change: `+${(Math.random() * 20).toFixed(1)}% from last period`, icon: DollarSign },
        { title: "Subscribers", value: `+${(Math.floor(Math.random() * 2000))}`, change: `+${(Math.floor(Math.random() * 500))} from last period`, icon: Users },
        { title: "Avg. Click Rate", value: `${(Math.random() * 10 + 5).toFixed(1)}%`, change: `${(Math.random() > 0.5 ? '+' : '-')}${(Math.random() * 3).toFixed(1)}% from last period`, icon: MousePointerClick },
        { title: "Total Impressions", value: (Math.floor(Math.random() * 2000000) + 500000).toLocaleString(), change: `+${(Math.floor(Math.random() * 100000)).toLocaleString()} from last period`, icon: TrendingUp },
    ];
}


export default function AnalyticsPage() {
    const [date, setDate] = useState<DateRange | undefined>(undefined);

    const [loading, setLoading] = useState(true);
    const [kpis, setKpis] = useState<any[]>([]);

    useEffect(() => {
        setLoading(true);
        // Simulate API call
        const timer = setTimeout(() => {
            setKpis(generateKpiData());
            setLoading(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [date]);

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
                <PerformanceOverview dateRange={date} />
                <RevenueAttribution dateRange={date} />
            </div>
            
             <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <TopCampaigns dateRange={date} />
                <TopAutomations dateRange={date} />
            </div>

            <DevicePerformance dateRange={date} />
        </div>
    );
}
