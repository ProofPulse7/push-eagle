'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoadingShell } from '@/components/ui/loading-ui';
import { SubscriberKpis } from '@/components/subscribers/subscriber-kpis';
import { SubscribersTable } from '@/components/subscribers/subscribers-table';
import { SubscriberGrowthChart } from '@/components/dashboard/subscriber-growth-chart';
import { useSubscribersOverview } from '@/hooks/queries/use-app-queries';
import { useQueryClient } from '@tanstack/react-query';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { queryKeys } from '@/lib/client/query-keys';

export default function SubscribersPage() {
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const cachedData = shop ? queryClient.getQueryData(queryKeys.subscribersOverview(shop)) : undefined;
  const { data, isLoading, isFetching } = useSubscribersOverview();
  const effectiveData = data ?? cachedData;
  const showInitialLoad = isLoading && !effectiveData;

  return (
    <PageLoadingShell
      title="Subscribers"
      isLoading={showInitialLoad}
      hasData={Boolean(effectiveData)}
      isFetching={isFetching && Boolean(effectiveData)}
    >
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Subscribers</h1>
        <p className="text-muted-foreground">Growth and your latest subscribers.</p>
      </div>

      <SubscriberKpis />

      <SubscriberGrowthChart showDatePicker defaultRange="all-time" fullWidth />

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
