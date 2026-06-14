'use client';

import { DollarSign, Send, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';

import { SubscriberGrowthChart } from '@/components/dashboard/subscriber-growth-chart';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardSummary } from '@/hooks/queries/use-app-queries';
import { useImpressionLimit } from '@/hooks/use-impression-limit';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { BASIC_PLAN } from '@/lib/client/billing-plans';
import { formatCurrency } from '@/lib/utils';

export function DashboardView() {
  const shopDomain = useShopDomain();
  const { atLimit } = useImpressionLimit();
  const { data, isLoading, isError, error } = useDashboardSummary();

  if (!shopDomain) {
    return (
      <div className="p-8">
        <Alert>
          <AlertTitle>Connect your store</AlertTitle>
          <AlertDescription>
            Open Push Eagle from your Shopify admin so we can load dashboard data for your shop.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const overview = (data?.overview ?? {}) as Record<string, unknown>;
  const campaignStatsRaw = (data?.campaignStats ?? {}) as Record<string, unknown>;
  const campaignStats = (campaignStatsRaw.stats ?? campaignStatsRaw) as Record<string, unknown>;
  const subscriberKpis = (data?.subscriberKpis ?? {}) as Record<string, unknown>;
  const billing = (data?.billing ?? {}) as Record<string, unknown>;

  const revenueCents = Number(campaignStats.revenueCents ?? 0);
  const impressionsUsed = Number(billing.impressionsUsed ?? campaignStats.impressions ?? 0);
  const impressionLimit = Number(billing.impressionLimit ?? BASIC_PLAN.impressions);
  const impressionsRemaining = Math.max(0, impressionLimit - impressionsUsed);
  const totalSubscribers = Number(
    subscriberKpis.totalSubscribers ?? overview.subscriberCount ?? 0,
  );
  const campaignsSent = Number(campaignStats.sentCount ?? campaignStats.sent ?? overview.campaignCount ?? 0);
  const growthPercent = Number(subscriberKpis.growthPercent ?? 0);
  const showValueSkeleton = isLoading && !data;

  const statCards = [
    {
      title: 'Revenue Generated',
      value: formatCurrency(revenueCents / 100),
      hint: revenueCents > 0 ? 'Attributed push revenue' : 'Start sending to track revenue',
      icon: DollarSign,
      accent: 'text-emerald-600',
    },
    {
      title: 'Total Campaigns Sent',
      value: campaignsSent.toLocaleString(),
      hint: `${Number(campaignStats.scheduledCount ?? 0).toLocaleString()} scheduled`,
      icon: Send,
      accent: 'text-blue-600',
    },
    {
      title: 'Subscribers',
      value: totalSubscribers.toLocaleString(),
      hint: `${growthPercent > 0 ? '+' : ''}${growthPercent.toFixed(1)}% vs last 7 days`,
      icon: Users,
      accent: 'text-violet-600',
    },
    {
      title: 'Impressions Consumed',
      value: `${impressionsUsed.toLocaleString()} / ${impressionLimit.toLocaleString()}`,
      hint: `${impressionsRemaining.toLocaleString()} remaining this period`,
      icon: TrendingUp,
      accent: 'text-amber-600',
    },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Error loading dashboard</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load dashboard data.'}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Your store performance at a glance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/campaigns">View Campaigns</Link>
          </Button>
          <Button asChild disabled={atLimit} title={atLimit ? 'Monthly impression limit reached. Upgrade on Plans.' : undefined}>
            <Link href={atLimit ? '/plans' : '/campaigns/new'}>
              <Send className="mr-2 h-4 w-4" />
              {atLimit ? 'Upgrade to send' : 'Create Campaign'}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.title} className="min-h-[160px] border-border/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-5 w-5 ${card.accent}`} />
            </CardHeader>
            <CardContent>
              {showValueSkeleton ? (
                <>
                  <Skeleton className="h-10 w-36" />
                  <Skeleton className="mt-3 h-3 w-full" />
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold tracking-tight">{card.value}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{card.hint}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <SubscriberGrowthChart fullWidth defaultDays={30} />
    </div>
  );
}
