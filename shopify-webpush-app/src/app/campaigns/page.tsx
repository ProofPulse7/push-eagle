
'use client';

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CampaignsTable } from '@/components/campaigns/campaigns-table';
import { CampaignStats } from '@/components/campaigns/campaign-stats';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { PageLoadingShell } from '@/components/ui/loading-ui';
import { formatCampaignDateRangeLabel } from '@/lib/client/campaign-date-range-label';
import { useCampaigns } from '@/hooks/queries/use-app-queries';
import { useImpressionLimit } from '@/hooks/use-impression-limit';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { queryKeys } from '@/lib/client/query-keys';
import { appendFreshCampaignWizardParam } from '@/lib/client/campaign-wizard-fresh';

export default function CampaignsPage() {
  const [date, setDate] = useState<DateRange | undefined>(undefined);
  const { atLimit } = useImpressionLimit();
  const shop = useShopDomain();
  const queryClient = useQueryClient();
  const cachedData = shop ? queryClient.getQueryData<{ campaigns?: unknown[] }>(queryKeys.campaigns(shop)) : undefined;
  const { data, isLoading, isError, error, refetch, isFetching } = useCampaigns();
  const effectiveData = data ?? cachedData;
  const statsPeriodLabel = formatCampaignDateRangeLabel(date);
  const loadError = isError
    ? error instanceof Error
      ? error.message
      : 'Failed to load campaigns.'
    : null;
  const showInitialLoad = Boolean(shop) && isLoading && !effectiveData;
  const showSessionWarning = !shop && !isLoading;
  const hasCachedOrLiveData = Boolean(effectiveData) || Boolean(shop);

  return (
    <PageLoadingShell
      title="Campaigns"
      isLoading={showInitialLoad}
      hasData={hasCachedOrLiveData || Boolean(loadError) || showSessionWarning}
      isFetching={isFetching && Boolean(effectiveData)}
      error={loadError}
    >
      <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
        {showSessionWarning ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-6 text-center">
            <p className="text-sm text-foreground">
              Your session expired. Reopen Push Eagle from Shopify Admin, or reload this page.
            </p>
            <Button className="mt-4" type="button" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        ) : null}

        {loadError && !effectiveData ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button className="mt-4" type="button" variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : null}

        {!showSessionWarning ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Campaigns</h1>
                <p className="text-muted-foreground">View and manage your past and current campaigns.</p>
              </div>
              <Button asChild disabled={atLimit} title={atLimit ? 'Monthly impression limit reached.' : undefined}>
                <Link href={atLimit ? '/plans' : appendFreshCampaignWizardParam('/campaigns/new/details')} prefetch>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  {atLimit ? 'Upgrade to send' : 'New Campaign'}
                </Link>
              </Button>
            </div>

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
          </>
        ) : null}
      </div>
    </PageLoadingShell>
  );
}
