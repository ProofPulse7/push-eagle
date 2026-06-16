
'use client';

import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import Link from 'next/link';
import { PlusCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CampaignsTable } from '@/components/campaigns/campaigns-table';
import { CampaignStats } from '@/components/campaigns/campaign-stats';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { PageLoadingShell } from '@/components/ui/loading-ui';
import { formatCampaignDateRangeLabel } from '@/lib/client/campaign-date-range-label';
import { ApiError } from '@/lib/client/api-fetch';
import { buildReconnectUrl } from '@/lib/client/session-recovery';
import { useCampaigns } from '@/hooks/queries/use-app-queries';
import { useImpressionLimit } from '@/hooks/use-impression-limit';
import { useShopDomain } from '@/hooks/use-shop-domain';

export default function CampaignsPage() {
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const { atLimit } = useImpressionLimit();
  const shopDomain = useShopDomain();
  const { data, isLoading, isError, error, refetch, isFetching } = useCampaigns();
  const statsPeriodLabel = formatCampaignDateRangeLabel(date);

  const errorMessage = isError
    ? error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Failed to load campaigns.'
    : null;

  useEffect(() => {
    const refreshCampaigns = () => {
      if (document.visibilityState === 'visible') {
        void refetch();
      }
    };

    document.addEventListener('visibilitychange', refreshCampaigns);
    return () => document.removeEventListener('visibilitychange', refreshCampaigns);
  }, [refetch]);

  return (
    <PageLoadingShell
      title="Campaigns"
      isLoading={isLoading && !data}
      hasData={Boolean(data) || isError}
      isFetching={isFetching && Boolean(data)}
      error={errorMessage}
    >
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Campaigns</h1>
          <p className="text-muted-foreground">View and manage your past and current campaigns.</p>
        </div>
        <Button asChild disabled={atLimit} title={atLimit ? 'Monthly impression limit reached.' : undefined}>
          <Link href={atLimit ? '/plans' : '/campaigns/new/details'} prefetch>
            <PlusCircle className="mr-2 h-4 w-4" />
            {atLimit ? 'Upgrade to send' : 'New Campaign'}
          </Link>
        </Button>
      </div>

      {isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive">
            {errorMessage || 'Your session may have expired after being idle.'}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            {shopDomain ? (
              <Button type="button" size="sm" asChild>
                <a href={buildReconnectUrl(shopDomain, '/campaigns')}>Reconnect store</a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Stats</h2>
              <p className="text-sm text-muted-foreground">Showing metrics for {statsPeriodLabel}.</p>
            </div>
            <DateRangePicker date={date} setDate={setDate} />
        </div>
        <CampaignStats date={date} />
      </div>

      <CampaignsTable dateRange={date} />
    </div>
    </PageLoadingShell>
  );
}
