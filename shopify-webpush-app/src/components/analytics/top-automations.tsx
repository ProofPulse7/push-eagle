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

type AutomationRow = {
  ruleKey: string;
  name: string;
  revenue: number;
  impressions: number;
  clicks: number;
};

export function TopAutomations({
  from,
  to,
  shopDomain,
}: {
  from: Date;
  to: Date;
  shopDomain?: string;
}) {
  const { data: payload, isLoading } = useAnalyticsStats(from, to);

  const automations = useMemo<AutomationRow[]>(() => {
    if (!payload?.ok) return [];
    return ((payload.topAutomations ?? []) as Array<{
      ruleKey: string;
      name: string;
      revenueCents: number;
      impressions: number;
      clicks: number;
    }>).map((a) => ({
      ruleKey: a.ruleKey,
      name: a.name,
      revenue: a.revenueCents / 100,
      impressions: a.impressions,
      clicks: a.clicks,
    }));
  }, [payload]);

  const loading = isLoading && !payload;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center">
        <div className="grid gap-2">
          <CardTitle>Top Automations</CardTitle>
          <CardDescription>Best performing automations in this period.</CardDescription>
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
          <Skeleton className="h-48 w-full" />
        ) : automations.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No automation data for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Automation</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((automation) => (
                <TableRow key={automation.ruleKey}>
                  <TableCell className="font-medium">{automation.name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(automation.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
