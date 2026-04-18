'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import { useSettings } from '@/context/settings-context';
import { useSearchParams } from 'next/navigation';

type Campaign = {
  id: string;
  title: string;
  status: string;
  deliveryCount: number;
  clickCount: number;
  revenueCents: number;
};

export function RecentActivity() {
  const { shopDomain: settingsShop } = useSettings();
  const searchParams = useSearchParams();
  const shopDomain = searchParams.get('shop') || settingsShop || '';

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shopDomain) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    fetch(`/api/campaigns?shop=${encodeURIComponent(shopDomain)}`)
      .then((res) => res.json())
      .then((payload) => {
        if (!active || !payload?.ok) return;
        const all: Campaign[] = (payload.campaigns ?? []).slice(0, 5);
        setCampaigns(all);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [shopDomain]);

  const ctr = (c: Campaign) =>
    c.deliveryCount > 0 ? `${((c.clickCount / c.deliveryCount) * 100).toFixed(1)}%` : '0%';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center">
        <div className="grid gap-2">
          <CardTitle>Recent Campaigns</CardTitle>
          <CardDescription>An overview of your last 5 campaigns.</CardDescription>
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
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No campaigns found yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">CTR</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell>
                    <div className="font-medium">{campaign.title}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={campaign.status === 'sent' ? 'default' : 'secondary'}>
                      {campaign.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{campaign.deliveryCount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{ctr(campaign)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(campaign.revenueCents / 100)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}