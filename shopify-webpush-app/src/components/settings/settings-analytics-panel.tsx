'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Lock, BarChart3 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isPaidPlanKey } from '@/lib/client/plan-access';
import { useImpressionLimit } from '@/hooks/use-impression-limit';

export function SettingsAnalyticsPanel() {
  const { planKey } = useImpressionLimit();
  const paid = useMemo(() => isPaidPlanKey(planKey), [planKey]);

  return (
    <Card className="mt-6 border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Advanced analytics
        </CardTitle>
        <CardDescription>
          Revenue attribution, top campaigns, and device performance. Available on paid plans only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {paid ? (
          <Button asChild>
            <Link href="/settings/analytics">Open analytics dashboard</Link>
          </Button>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Locked on the free plan</p>
                <p className="text-sm text-muted-foreground">
                  Upgrade to unlock analytics without loading heavy reports on free accounts.
                </p>
              </div>
            </div>
            <Button asChild variant="secondary">
              <Link href="/plans">View plans</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
