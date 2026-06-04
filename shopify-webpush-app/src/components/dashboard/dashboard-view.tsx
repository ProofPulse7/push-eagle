'use client';

import { DollarSign, Users, TrendingUp, Send, Check } from 'lucide-react';
import Link from 'next/link';

import { PerformanceChart } from '@/components/dashboard/performance-chart';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { SubscriberGrowthChart } from '@/components/dashboard/subscriber-growth-chart';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardSummary } from '@/hooks/queries/use-app-queries';
import { useImpressionLimit } from '@/hooks/use-impression-limit';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { formatCurrency } from '@/lib/utils';

const proPlanFeatures = [
  'All Basic Features',
  'Abandoned Cart Automation',
  'Hero Image Support',
  'Email Reports',
  'Segmentation',
  'Flash Sale',
  'Smart Delivery',
];

export function DashboardView() {
  const shopDomain = useShopDomain();
  const { atLimit } = useImpressionLimit();
  const { data, isLoading, isFetching, error, isError } = useDashboardSummary();

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

  const revenueCents = Number(campaignStats.revenueCents ?? 0);
  const impressions = Number(campaignStats.impressions ?? 0);
  const totalSubscribers = Number(
    subscriberKpis.totalSubscribers ?? overview.subscriberCount ?? 0,
  );
  const campaignCount = Number(overview.campaignCount ?? 0);
  const growthPercent = Number(subscriberKpis.growthPercent ?? 0);
  const newSubscribers7d = Number(subscriberKpis.newSubscribersLast7Days ?? 0);

  const revenueChange =
    revenueCents > 0
      ? `+${formatCurrency(revenueCents / 100)} this period`
      : 'No revenue yet';

  const subscriberChange =
    growthPercent !== 0
      ? `${growthPercent > 0 ? '+' : ''}${growthPercent.toFixed(1)}% vs last 7 days`
      : '+0% vs last 7 days';

  const showSkeleton = isLoading && !data;

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
      {isFetching && data ? (
        <p className="text-xs text-muted-foreground">Refreshing dashboard data…</p>
      ) : null}

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
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here&apos;s a snapshot of your performance.
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {showSkeleton ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card className="bg-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Revenue Generated</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(revenueCents / 100)}</div>
                <p className="text-xs text-muted-foreground">{revenueChange}</p>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Campaigns Sent</CardTitle>
                <Send className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{campaignCount}</div>
                <p className="text-xs text-muted-foreground">
                  {newSubscribers7d} new subscribers (7d)
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Subscribers</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalSubscribers.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">{subscriberChange}</p>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Impressions Consumed</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">
                  {impressions.toLocaleString()}
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-muted-foreground">5,000,000</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {(5_000_000 - impressions).toLocaleString()} impressions remaining
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <PerformanceChart />
        <SubscriberGrowthChart />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Your Current Plan</CardTitle>
            <CardDescription>
              You are on the <span className="font-semibold text-primary">Pro Plan</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Progress value={(totalSubscribers / 4_000_000) * 100} aria-label="Plan usage" />
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {totalSubscribers.toLocaleString()} / 4,000,000
                </span>{' '}
                Subscribers
              </div>
            </div>
            <Separator />
            <ul className="space-y-2 text-sm text-muted-foreground">
              {proPlanFeatures.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" className="w-full" asChild>
              <Link href="/plans">Manage Plan</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
