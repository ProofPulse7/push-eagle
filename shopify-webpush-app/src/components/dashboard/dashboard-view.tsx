'use client';

import { DollarSign, Send, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';

import { SubscriberGrowthChart } from '@/components/dashboard/subscriber-growth-chart';
import { ThemeExtensionWarningBanner } from '@/components/dashboard/theme-extension-warning-banner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageLoadingShell } from '@/components/ui/loading-ui';
import { useDashboardSummary, useSubscriberTotalCount, useSubscribersOverview } from '@/hooks/queries/use-app-queries';
import { useImpressionLimit } from '@/hooks/use-impression-limit';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { BASIC_PLAN } from '@/lib/client/billing-plans';
import { appendFreshCampaignWizardParam } from '@/lib/client/campaign-wizard-fresh';
import { queryKeys } from '@/lib/client/query-keys';
import { formatCurrency } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

export function DashboardView() {
  const shopDomain = useShopDomain();
  const queryClient = useQueryClient();
  const cachedData = shopDomain ? queryClient.getQueryData(queryKeys.dashboardSummary(shopDomain)) : undefined;
  const { atLimit } = useImpressionLimit();
  const { data, isLoading, isError, error } = useDashboardSummary();
  const effectiveData = data ?? cachedData;

  const overview = (effectiveData?.overview ?? {}) as Record<string, unknown>;
  const campaignStatsRaw = (effectiveData?.campaignStats ?? {}) as Record<string, unknown>;
  const campaignStats = (campaignStatsRaw.stats ?? campaignStatsRaw) as Record<string, unknown>;
  const subscriberKpis = (effectiveData?.subscriberKpis ?? {}) as Record<string, unknown>;
  const billing = (effectiveData?.billing ?? {}) as Record<string, unknown>;

  const automationTotals = (effectiveData?.automationTotals ?? {}) as Record<string, unknown>;
  const campaignRevenueCents = Number(campaignStats.revenueCents ?? 0);
  const automationRevenueCents = Number(automationTotals.revenueCents ?? 0);
  const revenueCents = campaignRevenueCents + automationRevenueCents;
  const billingImpressions = Number(billing.impressionsUsed ?? 0);
  const impressionsUsed = billingImpressions;
  const impressionLimit = Number(billing.impressionLimit ?? BASIC_PLAN.impressions);
  const impressionsRemaining = Math.max(0, impressionLimit - impressionsUsed);
  const { data: subscribersOverview } = useSubscribersOverview();
  const totalSubscribers = useSubscriberTotalCount();
  const growthPercent = Number(
    subscribersOverview?.growthPercent ?? subscriberKpis.growthPercent ?? 0,
  );
  const campaignsSent = Number(campaignStats.sentCount ?? campaignStats.sent ?? overview.campaignCount ?? 0);
  const showValueSkeleton = isLoading && !effectiveData;
  const showInitialLoad = Boolean(shopDomain) && isLoading && !effectiveData;

  const statCards = [
    {
      title: 'Revenue Generated',
      value: formatCurrency(revenueCents / 100),
      hint: revenueCents > 0 ? 'Attributed push revenue' : 'Start sending to track revenue',
      icon: DollarSign,
      accent: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: 'Total Campaigns Sent',
      value: campaignsSent.toLocaleString(),
      hint: `${Number(campaignStats.scheduledCount ?? 0).toLocaleString()} scheduled`,
      icon: Send,
      accent: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Total Subscribers',
      value: totalSubscribers.toLocaleString(),
      hint: `Active subscribers (all time) · ${growthPercent > 0 ? '+' : ''}${growthPercent.toFixed(1)}% new in last 7 days`,
      icon: Users,
      accent: 'text-violet-600 dark:text-violet-400',
    },
    {
      title: 'Impressions Consumed',
      value: `${impressionsUsed.toLocaleString()} / ${impressionLimit.toLocaleString()}`,
      hint: `${impressionsRemaining.toLocaleString()} remaining this period`,
      icon: TrendingUp,
      accent: 'text-amber-600 dark:text-amber-400',
    },
  ];

  return (
    <PageLoadingShell
      title="Dashboard"
      isLoading={showInitialLoad}
      hasData={Boolean(effectiveData) || !shopDomain || (isError && !effectiveData)}
      isFetching={isLoading && Boolean(effectiveData)}
    >
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6 bg-background">
      {!shopDomain ? (
        <Alert>
          <AlertTitle>Connect your store</AlertTitle>
          <AlertDescription>
            Open Push Eagle from your Shopify admin so we can load dashboard data for your shop.
          </AlertDescription>
        </Alert>
      ) : null}

      {shopDomain ? <ThemeExtensionWarningBanner /> : null}

      {isError && !effectiveData ? (
        <Alert variant="destructive">
          <AlertTitle>Error loading dashboard</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load dashboard data.'}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your store performance at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/campaigns">View Campaigns</Link>
          </Button>
          <Button asChild disabled={atLimit} title={atLimit ? 'Monthly impression limit reached. Upgrade on Plans.' : undefined}>
            <Link href={atLimit ? '/plans' : appendFreshCampaignWizardParam('/campaigns/new/details')}>
              <Send className="mr-2 h-4 w-4" />
              {atLimit ? 'Upgrade to send' : 'Create Campaign'}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title} className="min-h-[140px] border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.accent}`} />
            </CardHeader>
            <CardContent>
              {showValueSkeleton ? (
                <>
                  <Skeleton className="h-9 w-32" />
                  <Skeleton className="mt-2 h-3 w-full" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold tracking-tight">{card.value}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <SubscriberGrowthChart fullWidth defaultDays={30} />
    </div>
    </PageLoadingShell>
  );
}
