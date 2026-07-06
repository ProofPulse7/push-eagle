'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserPlus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useSubscriberTotalCount, useSubscribersOverview } from '@/hooks/queries/use-app-queries';

export function SubscriberKpis() {
  const { data, isLoading } = useSubscribersOverview();
  const totalSubscribers = useSubscriberTotalCount();

  const stats = {
    totalSubscribers,
    newSubscribersLast7Days: Number(data?.newSubscribersLast7Days ?? 0),
    growthPercent: Number(data?.growthPercent ?? 0),
  };

  const loading = isLoading && !data;

  const cards = [
    {
      title: 'Total Subscribers',
      value: stats.totalSubscribers.toLocaleString(),
      icon: Users,
      description: 'Active notification subscribers (all time)',
    },
    {
      title: 'New Subscribers (last 7 days)',
      value: `+${stats.newSubscribersLast7Days.toLocaleString()}`,
      icon: UserPlus,
      description: `${stats.growthPercent >= 0 ? '+' : ''}${stats.growthPercent.toFixed(1)}% vs previous 7 days`,
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }

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
