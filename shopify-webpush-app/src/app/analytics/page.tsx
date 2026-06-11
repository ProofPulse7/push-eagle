
'use client';

import { useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { BarChart, DollarSign, MousePointerClick, TrendingUp, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { KpiCard } from '@/components/analytics/kpi-card';
import { PerformanceOverview } from '@/components/analytics/performance-overview';
import { RevenueAttribution } from '@/components/analytics/revenue-attribution';
import { TopCampaigns } from '@/components/analytics/top-campaigns';
import { TopAutomations } from '@/components/analytics/top-automations';
import { DevicePerformance } from '@/components/analytics/device-performance';
import { formatCurrency } from '@/lib/utils';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { PageLoadingShell } from '@/components/ui/loading-ui';
import { resolveAnalyticsDateRange } from '@/lib/client/analytics-date-range';
import { useAnalyticsStats } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';

type KpiItem = {
  title: string;
  value: string;
  change: string;
  icon: LucideIcon;
};

export default function AnalyticsPage() {
  const shopDomain = useShopDomain();
  const [date, setDate] = useState<DateRange | undefined>(undefined);

  const { from, to } = useMemo(() => resolveAnalyticsDateRange(date), [date]);
  const { data: payload, isLoading, isFetching, isError, error } = useAnalyticsStats(from, to);

  const kpis = useMemo<KpiItem[]>(() => {
    if (!shopDomain) {
      return [
        { title: 'Total Revenue', value: formatCurrency(0), change: 'No shop connected', icon: DollarSign },
        { title: 'New Subscribers', value: '0', change: 'No shop connected', icon: Users },
        { title: 'Avg. Click Rate', value: '0%', change: 'No shop connected', icon: MousePointerClick },
        { title: 'Total Impressions', value: '0', change: 'No shop connected', icon: TrendingUp },
      ];
    }

    const k = (payload?.kpis ?? {}) as Record<string, number>;
    return [
      {
        title: 'Total Revenue',
        value: formatCurrency((k.totalRevenueCents ?? 0) / 100),
        change: (k.totalRevenueCents ?? 0) > 0 ? 'Revenue attributed via push' : 'No revenue yet',
        icon: DollarSign,
      },
      {
        title: 'New Subscribers',
        value: `+${(k.newSubscribers ?? 0).toLocaleString()}`,
        change: 'In selected period',
        icon: Users,
      },
      {
        title: 'Avg. Click Rate',
        value: `${(k.avgCtrPercent ?? 0).toFixed(1)}%`,
        change: `${(k.totalClicks ?? 0).toLocaleString()} total clicks`,
        icon: MousePointerClick,
      },
      {
        title: 'Total Impressions',
        value: (k.totalImpressions ?? 0).toLocaleString(),
        change: 'Campaigns + automations',
        icon: TrendingUp,
      },
    ];
  }, [shopDomain, payload]);

  const loadError =
    isError && !payload
      ? error instanceof Error
        ? error.message
        : 'Failed to load analytics.'
      : null;

  return (
    <PageLoadingShell
      title="Analytics"
      description="Your central hub for performance metrics."
      isLoading={isLoading}
      hasData={Boolean(payload) || Boolean(shopDomain)}
      isFetching={isFetching}
      error={loadError}
    >
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
          <PerformanceOverview from={from} to={to} shopDomain={shopDomain} />
          <RevenueAttribution from={from} to={to} shopDomain={shopDomain} />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <TopCampaigns from={from} to={to} shopDomain={shopDomain} />
          <TopAutomations from={from} to={to} shopDomain={shopDomain} />
        </div>

        <DevicePerformance shopDomain={shopDomain} />
      </div>
    </PageLoadingShell>
  );
}
