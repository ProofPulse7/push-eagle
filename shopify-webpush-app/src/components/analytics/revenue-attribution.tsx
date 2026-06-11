
'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { useMemo } from 'react';
import { useAnalyticsStats } from '@/hooks/queries/use-app-queries';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

const RevenueAttributionChart = dynamic(() => import('./revenue-attribution-chart'), {
  ssr: false,
  loading: () => <Skeleton className="mx-auto aspect-square w-full max-w-[250px] rounded-full" />,
});

const emptyData = [
  { source: 'campaigns', revenue: 0, fill: 'var(--color-campaigns)' },
  { source: 'automations', revenue: 0, fill: 'var(--color-automations)' },
];

export function RevenueAttribution({
  from,
  to,
  shopDomain,
}: {
  from: Date;
  to: Date;
  shopDomain?: string;
}) {
  const { data: payload, isLoading } = useAnalyticsStats(from, to);

  const data = useMemo(() => {
    if (!payload?.ok) return emptyData;
    const attribution = (payload.attribution ?? {}) as Record<string, number>;
    return [
      { source: 'campaigns', revenue: (attribution.campaignRevenueCents ?? 0) / 100, fill: 'var(--color-campaigns)' },
      { source: 'automations', revenue: (attribution.automationRevenueCents ?? 0) / 100, fill: 'var(--color-automations)' },
    ];
  }, [payload]);

  if (isLoading && !payload) {
    return (
      <Card className="flex flex-col h-full">
        <CardHeader>
          <CardTitle>Revenue Attribution</CardTitle>
          <CardDescription>Revenue from manual campaigns vs. automated flows.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col items-center justify-center relative">
          <div className="mx-auto aspect-square w-full max-w-[250px] flex items-center justify-center">
            <Skeleton className="h-full w-full rounded-full" />
          </div>
        </CardContent>
        <CardContent className="flex flex-col gap-3 text-sm pt-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Separator className="my-2" />
          <div className='flex justify-between'>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalRevenue = data.reduce((acc, curr) => acc + curr.revenue, 0);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle>Revenue Attribution</CardTitle>
        <CardDescription>Revenue from manual campaigns vs. automated flows.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center relative pt-0 pb-4">
        <RevenueAttributionChart data={data} />
      </CardContent>
      <CardContent className="flex flex-col gap-3 text-sm pt-4 mt-auto">
        {data.map((entry) => {
          const percentage =
            totalRevenue > 0 ? (entry.revenue / totalRevenue) * 100 : 0;
          return (
            <div
              key={entry.source}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.fill }}
                />
                <span className="capitalize text-muted-foreground">
                  {entry.source}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <p className="font-medium text-foreground">
                  {formatCurrency(entry.revenue)}
                </p>
                <p className="w-12 text-right font-medium text-muted-foreground">
                  {percentage.toFixed(1)}%
                </p>
              </div>
            </div>
          );
        })}
        <Separator className="my-2" />
        <div className="flex items-center justify-between font-bold">
          <span>Total Revenue</span>
          <span>{formatCurrency(totalRevenue)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
