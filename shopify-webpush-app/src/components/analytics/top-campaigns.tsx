'use client';

import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"

type CampaignRow = {
  id: string;
  title: string;
  revenue: number;
  impressions: number;
  clicks: number;
};

export function TopCampaigns({ dateRange, shopDomain }: { dateRange: DateRange | undefined; shopDomain?: string }) {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shopDomain) {
      setCampaigns([]);
      return;
    }

    const from = dateRange?.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = dateRange?.to ?? new Date();

    let active = true;
    setLoading(true);

    fetch(
      `/api/analytics/stats?shop=${encodeURIComponent(shopDomain)}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
    )
      .then((res) => res.json())
      .then((payload) => {
        if (!active || !payload?.ok) return;
        setCampaigns(
          (payload.topCampaigns ?? []).map((c: { id: string; title: string; revenueCents: number; impressions: number; clicks: number }) => ({
            id: c.id,
            title: c.title,
            revenue: c.revenueCents / 100,
            impressions: c.impressions,
            clicks: c.clicks,
          })),
        );
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [shopDomain, dateRange]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center">
        <div className="grid gap-2">
            <CardTitle>Top Performing Campaigns</CardTitle>
            <CardDescription>Your most successful manual campaigns by revenue.</CardDescription>
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
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : campaigns.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No campaign data for the selected period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow key={campaign.id}>
                  <TableCell><div className="font-medium">{campaign.title}</div></TableCell>
                  <TableCell className="text-right">{formatCurrency(campaign.revenue)}</TableCell>
                  <TableCell className="text-right">{campaign.impressions.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{campaign.clicks.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

