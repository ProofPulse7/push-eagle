'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSubscribersOverview } from '@/hooks/queries/use-app-queries';

const DevicePerformanceCharts = dynamic(() => import('./device-performance-charts'), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

type DevicePoint = { device: string; value: number; fill: string };

const DEVICES = ['android', 'windows', 'macos', 'ios'];
const FILLS: Record<string, string> = {
  android: 'var(--color-android)',
  windows: 'var(--color-windows)',
  macos: 'var(--color-macos)',
  ios: 'var(--color-ios)',
};

const emptyData = (): { revenueData: DevicePoint[]; subscribersData: DevicePoint[]; clickRateData: DevicePoint[] } => ({
  revenueData: DEVICES.map((d) => ({ device: d.charAt(0).toUpperCase() + d.slice(1), value: 0, fill: FILLS[d] })),
  subscribersData: DEVICES.map((d) => ({ device: d.charAt(0).toUpperCase() + d.slice(1), value: 0, fill: FILLS[d] })),
  clickRateData: DEVICES.map((d) => ({ device: d.charAt(0).toUpperCase() + d.slice(1), value: 0, fill: FILLS[d] })),
});

export function DevicePerformance({ shopDomain }: { shopDomain?: string }) {
  const { data: payload, isLoading } = useSubscribersOverview();

  const data = useMemo(() => {
    if (!shopDomain || !payload?.ok) return emptyData();

    const platforms = (payload.platforms ?? []) as Array<{ name: string; value?: number; count?: number }>;
    const total = platforms.reduce((acc, p) => acc + Number(p.value ?? p.count ?? 0), 0);

    const subsData = DEVICES.map((d) => {
      const match = platforms.find((p) => p.name?.toLowerCase().includes(d === 'macos' ? 'mac' : d));
      return {
        device: d.charAt(0).toUpperCase() + d.slice(1),
        value: Number(match?.value ?? match?.count ?? 0),
        fill: FILLS[d],
      };
    });

    const ctrData = DEVICES.map((d) => {
      const match = platforms.find((p) => p.name?.toLowerCase().includes(d === 'macos' ? 'mac' : d));
      const pct = total > 0 ? (Number(match?.value ?? match?.count ?? 0) / total) * 100 : 0;
      return { device: d.charAt(0).toUpperCase() + d.slice(1), value: parseFloat(pct.toFixed(1)), fill: FILLS[d] };
    });

    return { revenueData: emptyData().revenueData, subscribersData: subsData, clickRateData: ctrData };
  }, [shopDomain, payload]);

  const loading = isLoading && !payload;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Device Performance</CardTitle>
        <CardDescription>Breakdown of key metrics by subscriber device.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <DevicePerformanceCharts data={data} />
        )}
      </CardContent>
    </Card>
  );
}
