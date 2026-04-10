
'use client';

import { useState, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';


const generateStatsData = () => [
    { label: "Impressions", value: (Math.floor(Math.random() * 200000) + 50000).toLocaleString() },
    { label: "Clicks", value: (Math.floor(Math.random() * 10000) + 2000).toLocaleString() },
    { label: "Avg. CTR", value: `${(Math.random() * 5 + 2).toFixed(1)}%` },
    { label: "Revenue generated", value: formatCurrency(Math.floor(Math.random() * 100000) + 10000) }
];

const StatSkeleton = () => (
    <div className="p-6">
        <Skeleton className="h-5 w-24 mb-2" />
        <Skeleton className="h-8 w-32" />
    </div>
);


export function CampaignStats({ date }: { date: DateRange | undefined }) {
    const [statsData, setStatsData] = useState<any[] | null>(null);
    
    useEffect(() => {
        setStatsData(null); 
        const timer = setTimeout(() => {
            setStatsData(generateStatsData());
        }, 300);
        return () => clearTimeout(timer);
    }, [date]);

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
