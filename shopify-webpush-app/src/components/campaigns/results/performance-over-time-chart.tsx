'use client';

import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const PerformanceOverTimeChartBody = dynamic(() => import('./performance-over-time-chart-body'), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

type Point = {
  hour: string;
  clicks: number;
};

export function PerformanceOverTimeChart({ data }: { data: Point[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Over Time</CardTitle>
        <CardDescription>Clicks in the first 24 hours after sending.</CardDescription>
      </CardHeader>
      <CardContent>
        <PerformanceOverTimeChartBody data={data} />
      </CardContent>
    </Card>
  );
}
