'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, MousePointerClick, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

type Stats = {
    reached?: number;
    clickRate?: string;
    sales?: number;
};

export function OverviewStats({ stats }: { stats: Stats }) {
    const statsData = [
        { 
            label: "Subscribers Reached", 
            value: stats.reached?.toLocaleString() ?? 'N/A', 
            icon: Users 
        },
        { 
            label: "Avg. Click Rate", 
            value: stats.clickRate ?? 'N/A', 
            icon: MousePointerClick
        },
        { 
            label: "Sales Attributed", 
            value: typeof stats.sales === 'number' ? formatCurrency(stats.sales) : 'N/A', 
            icon: DollarSign
        },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-3">
            {statsData.map(stat => (
                <Card key={stat.label}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                        <stat.icon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stat.value}</div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
