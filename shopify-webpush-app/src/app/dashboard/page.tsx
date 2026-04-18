
import { DollarSign, Users, TrendingUp, Send, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PerformanceChart } from '@/components/dashboard/performance-chart';
import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { SubscriberGrowthChart } from '@/components/dashboard/subscriber-growth-chart';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { getCampaignStats, getSubscriberKpis, getMerchantOverview } from '@/lib/server/data/store';

async function getDashboardData(shopDomain?: string | null) {
  if (!shopDomain) {
    return {
      stats: {
        revenueGenerated: 0,
        revenueChange: 'No data yet',
        totalCampaignsSent: 0,
        campaignsChange: 'No data yet',
        totalSubscribers: 0,
        impressionsConsumed: 0,
        impressionsLimit: 5000000,
      },
      error: null,
    };
  }

  try {
    const [campaignStats, subscriberKpis, merchantOverview] = await Promise.all([
      getCampaignStats(shopDomain),
      getSubscriberKpis(shopDomain),
      getMerchantOverview(shopDomain),
    ]);

    const revenueChange =
      campaignStats.revenueCents > 0
        ? `${campaignStats.revenueCents > 0 ? '+' : ''}${formatCurrency(campaignStats.revenueCents / 100)} this period`
        : 'No revenue yet';

    const subscriberChange =
      subscriberKpis.growthPercent !== 0
        ? `${subscriberKpis.growthPercent > 0 ? '+' : ''}${subscriberKpis.growthPercent.toFixed(1)}% vs last 7 days`
        : '+0% vs last 7 days';

    return {
      stats: {
        revenueGenerated: campaignStats.revenueCents / 100,
        revenueChange,
        totalCampaignsSent: merchantOverview.campaignCount,
        campaignsChange: `${subscriberKpis.newSubscribersLast7Days} new subscribers (7d)`,
        totalSubscribers: subscriberKpis.totalSubscribers,
        impressionsConsumed: campaignStats.impressions,
        impressionsLimit: 5000000,
        subscriberChange,
      },
      error: null,
    };
  } catch (err) {
    return {
      stats: {
        revenueGenerated: 0,
        revenueChange: 'Unable to load',
        totalCampaignsSent: 0,
        campaignsChange: 'Unable to load',
        totalSubscribers: 0,
        impressionsConsumed: 0,
        impressionsLimit: 5000000,
      },
      error: err instanceof Error ? err.message : 'Failed to load dashboard data.',
    };
  }
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ shop?: string }> }) {
  const params = await searchParams;
  const shopDomain = params.shop?.trim().toLowerCase() || null;
  const { stats, error } = await getDashboardData(shopDomain);

  if (error) {
    return (
        <div className="p-8">
            <Alert variant="destructive">
                <AlertTitle>Error Loading Dashboard</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        </div>
    );
  }

  const proPlanFeatures = [
      "All Basic Features",
      "Abandoned Cart Automation",
      "Hero Image Support",
      "Email Reports",
      "Segmentation",
      "Flash Sale",
      "Smart Delivery",
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here&apos;s a snapshot of your performance.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
                <Link href="/campaigns">View Campaigns</Link>
            </Button>
            <Button asChild>
                <Link href="/campaigns/new">
                    <Send className="mr-2 h-4 w-4" />
                    Create Campaign
                </Link>
            </Button>
        </div>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revenue Generated</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
                {formatCurrency(stats.revenueGenerated)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.revenueChange}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCampaignsSent}</div>
            <p className="text-xs text-muted-foreground">
              {stats.campaignsChange}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subscribers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSubscribers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {'subscriberChange' in stats ? (stats as any).subscriberChange : ''}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Impressions Consumed</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
                {stats.impressionsConsumed.toLocaleString()}
                <span className="text-muted-foreground"> / </span>
                <span className="text-muted-foreground">{stats.impressionsLimit.toLocaleString()}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {(stats.impressionsLimit - stats.impressionsConsumed).toLocaleString()} impressions remaining
            </p>
          </CardContent>
        </Card>
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
                    <Progress value={(stats.totalSubscribers / 4000000) * 100} aria-label="Plan usage" />
                    <div className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{stats.totalSubscribers.toLocaleString()} / 4,000,000</span> Subscribers
                    </div>
                 </div>
                 <Separator/>
                 <ul className="space-y-2 text-sm text-muted-foreground">
                    {proPlanFeatures.map(feature => (
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
