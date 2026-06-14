'use client';

import { useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import Link from 'next/link';
import { BarChart, DollarSign, Lock, MousePointerClick, TrendingUp, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { KpiCard } from '@/components/analytics/kpi-card';
import { PerformanceOverview } from '@/components/analytics/performance-overview';
import { RevenueAttribution } from '@/components/analytics/revenue-attribution';
import { TopCampaigns } from '@/components/analytics/top-campaigns';
import { TopAutomations } from '@/components/analytics/top-automations';
import { DevicePerformance } from '@/components/analytics/device-performance';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { PageLoadingShell } from '@/components/ui/loading-ui';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { resolveAnalyticsDateRange } from '@/lib/client/analytics-date-range';
import { isPaidPlanKey } from '@/lib/client/plan-access';
import { useAnalyticsStats } from '@/hooks/queries/use-app-queries';
import { useImpressionLimit } from '@/hooks/use-impression-limit';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { formatCurrency } from '@/lib/utils';

type KpiItem = {
  title: string;
  value: string;
  change: string;
  icon: LucideIcon;
};

export default function SettingsAnalyticsPage() {
  const shopDomain = useShopDomain();
  const { planKey } = useImpressionLimit();
  const paid = isPaidPlanKey(planKey);
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const { from, to } = useMemo(() => resolveAnalyticsDateRange(date), [date]);
  const { data: payload, isLoading, isFetching, isError, error } = useAnalyticsStats(from, to, paid);

  const kpis = useMemo<KpiItem[]>(() => {
    if (!payload?.ok) {
      return [
        { title: 'Total Revenue', value: formatCurrency(0), change: '—', icon: DollarSign },
        { title: 'New Subscribers', value: '0', change: '—', icon: Users },
        { title: 'Click Rate', value: '0%', change: '—', icon: MousePointerClick },
        { title: 'Impressions', value: '0', change: '—', icon: TrendingUp },
      ];
    }

    return [
      {
        title: 'Total Revenue',
        value: formatCurrency(Number(payload.revenueCents ?? 0) / 100),
        change: String(payload.revenueChange ?? '—'),
        icon: DollarSign,
      },
      {
        title: 'New Subscribers',
        value: Number(payload.newSubscribers ?? 0).toLocaleString(),
        change: String(payload.subscriberChange ?? '—'),
        icon: Users,
      },
      {
        title: 'Click Rate',
        value: `${Number(payload.clickRate ?? 0).toFixed(1)}%`,
        change: String(payload.clickRateChange ?? '—'),
        icon: MousePointerClick,
      },
      {
        title: 'Impressions',
        value: Number(payload.impressions ?? 0).toLocaleString(),
        change: String(payload.impressionChange ?? '—'),
        icon: TrendingUp,
      },
    ];
  }, [payload]);

  if (!paid) {
    return (
      <div className="p-4 sm:p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Analytics locked
            </CardTitle>
            <CardDescription>
              Advanced analytics is included with paid plans. No analytics data is loaded on the free plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button asChild variant="secondary">
              <Link href="/settings?tab=attribution">Back to settings</Link>
            </Button>
            <Button asChild>
              <Link href="/plans">Upgrade plan</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PageLoadingShell
      title="Analytics"
      isLoading={isLoading}
      hasData={Boolean(payload)}
      isFetching={isFetching}
    >
      <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
              <BarChart className="h-7 w-7" />
              Analytics
            </h1>
            <p className="text-muted-foreground">
              {shopDomain ? `Performance for ${shopDomain}` : 'Connect your store to view analytics.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker date={date} setDate={setDate} />
            <Button variant="outline" asChild>
              <Link href="/settings?tab=attribution">Back to settings</Link>
            </Button>
          </div>
        </div>

        {isError ? (
          <Card>
            <CardContent className="pt-6 text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load analytics.'}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => (
                <KpiCard key={kpi.title} {...kpi} />
              ))}
            </div>
            <PerformanceOverview from={from} to={to} />
            <div className="grid gap-8 lg:grid-cols-2">
              <RevenueAttribution from={from} to={to} />
              <DevicePerformance />
            </div>
            <div className="grid gap-8 lg:grid-cols-2">
              <TopCampaigns from={from} to={to} />
              <TopAutomations from={from} to={to} />
            </div>
          </>
        )}
      </div>
    </PageLoadingShell>
  );
}
