'use client';

import { useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { useAnalyticsStats } from '@/hooks/queries/use-app-queries';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';

type CampaignRow = {
  id: string;
  title: string;
  revenue: number;
  impressions: number;
  clicks: number;
};

export function TopCampaigns({
  from,
  to,
  shopDomain,
}: {
  from: Date;
  to: Date;
  shopDomain?: string;
}) {
  const { data: payload, isLoading } = useAnalyticsStats(from, to);

  const campaigns = useMemo<CampaignRow[]>(() => {
    if (!payload?.ok) return [];
    return ((payload.topCampaigns ?? []) as Array<{
      id: string;
      title: string;
      revenueCents: number;
      impressions: number;
      clicks: number;
    }>).map((c) => ({
      id: c.id,
      title: c.title,
      revenue: c.revenueCents / 100,
      impressions: c.impressions,
      clicks: c.clicks,
    }));
  }, [payload]);

  const loading = isLoading && !payload;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center">
        <div className="grid gap-2">
          <CardTitle>Top Campaigns</CardTitle>
          <CardDescription>Best performing campaigns in this period.</CardDescription>
        </div>
        <Button asChild size="sm" className="ml-auto gap-1">
          <Link href="/campaigns">
            View All
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : campaigns.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No campaign data for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell className="font-medium">{campaign.title}</TableCell>
                  <TableCell className="text-right">{formatCurrency(campaign.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
