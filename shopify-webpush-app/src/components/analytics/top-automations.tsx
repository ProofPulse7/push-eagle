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

type AutomationRow = {
  ruleKey: string;
  name: string;
  revenue: number;
  impressions: number;
  clicks: number;
};

export function TopAutomations({ dateRange, shopDomain }: { dateRange: DateRange | undefined; shopDomain?: string }) {
  const [automations, setAutomations] = useState<AutomationRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shopDomain) {
      setAutomations([]);
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
        setAutomations(
          (payload.topAutomations ?? []).map((a: { ruleKey: string; name: string; revenueCents: number; impressions: number; clicks: number }) => ({
            ruleKey: a.ruleKey,
            name: a.name,
            revenue: a.revenueCents / 100,
            impressions: a.impressions,
            clicks: a.clicks,
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
            <CardTitle>Top Performing Automations</CardTitle>
            <CardDescription>Your most successful automated flows by revenue.</CardDescription>
        </div>
        <Button asChild size="sm" className="ml-auto gap-1">
          <Link href="/automations">
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
        ) : automations.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No automation data for the selected period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Automation</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((automation) => (
                <TableRow key={automation.ruleKey}>
                  <TableCell><div className="font-medium">{automation.name}</div></TableCell>
                  <TableCell className="text-right">{formatCurrency(automation.revenue)}</TableCell>
                  <TableCell className="text-right">{automation.impressions.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{automation.clicks.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

