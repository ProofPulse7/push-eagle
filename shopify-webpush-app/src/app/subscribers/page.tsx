
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoadingShell } from '@/components/ui/loading-ui';
import { SubscriberKpis } from '@/components/subscribers/subscriber-kpis';
import { SubscribersTable } from '@/components/subscribers/subscribers-table';
import { SubscriberGrowthChart } from '@/components/dashboard/subscriber-growth-chart';
import { useSubscribersOverview } from '@/hooks/queries/use-app-queries';

export default function SubscribersPage() {
  const { data, isLoading, isFetching } = useSubscribersOverview();

  return (
    <PageLoadingShell
      title="Subscribers"
      isLoading={isLoading}
      hasData={Boolean(data)}
      isFetching={isFetching}
    >
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Subscribers</h1>
        <p className="text-muted-foreground">Growth and your latest subscribers.</p>
      </div>

      <SubscriberKpis />

      <SubscriberGrowthChart showDatePicker defaultDays={30} fullWidth />

      <Card>
        <CardHeader>
          <CardTitle>Latest subscribers</CardTitle>
        </CardHeader>
        <CardContent>
          <SubscribersTable maxRows={50} />
        </CardContent>
      </Card>
    </div>
    </PageLoadingShell>
  );
}
