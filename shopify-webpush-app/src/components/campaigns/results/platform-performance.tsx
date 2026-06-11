'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const PlatformPerformanceChartBody = dynamic(() => import('./platform-performance-chart-body'), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

type PlatformPoint = {
  platform: string;
  clicks: number;
  fill?: string;
};

export function PlatformPerformance({ data }: { data: PlatformPoint[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Platform Performance</CardTitle>
        <CardDescription>Total clicks broken down by platform.</CardDescription>
      </CardHeader>
      <CardContent>
        <PlatformPerformanceChartBody data={data} />
      </CardContent>
    </Card>
  );
}
