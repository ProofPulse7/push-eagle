'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserPlus } from 'lucide-react';
import { useSettings } from '@/context/settings-context';

type KpiStats = {
    totalSubscribers: number;
    newSubscribersLast7Days: number;
    growthPercent: number;
};

export function SubscriberKpis() {
    const { shopDomain } = useSettings();
    const [stats, setStats] = useState<KpiStats>({
        totalSubscribers: 0,
        newSubscribersLast7Days: 0,
        growthPercent: 0,
    });

    useEffect(() => {
        if (!shopDomain) {
            return;
        }

        let active = true;
        fetch(`/api/subscribers/overview?shop=${encodeURIComponent(shopDomain)}`)
            .then((response) => response.json())
            .then((data) => {
                if (!active || !data?.ok) {
                    return;
                }

                setStats({
                    totalSubscribers: Number(data.totalSubscribers ?? 0),
                    newSubscribersLast7Days: Number(data.newSubscribersLast7Days ?? 0),
                    growthPercent: Number(data.growthPercent ?? 0),
                });
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [shopDomain]);

    const cards = [
        {
            title: 'Total Subscribers',
            value: stats.totalSubscribers.toLocaleString(),
            icon: Users,
            description: 'Saved in subscriber database',
        },
        {
            title: 'New Subscribers (last 7 days)',
            value: `+${stats.newSubscribersLast7Days.toLocaleString()}`,
            icon: UserPlus,
            description: `${stats.growthPercent >= 0 ? '+' : ''}${stats.growthPercent.toFixed(1)}% vs previous 7 days`,
        },
    ];

    return (
        <div className="grid gap-4 md:grid-cols-2">
            {cards.map((stat) => (
                <Card key={stat.title}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                        <stat.icon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stat.value}</div>
                        <p className="text-xs text-muted-foreground">{stat.description}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
