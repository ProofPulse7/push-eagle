
'use client';

import { useState, useEffect } from 'react';
import type { DateRange } from 'react-day-picker';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CampaignsTable } from '@/components/campaigns/campaigns-table';
import { CampaignStats } from '@/components/campaigns/campaign-stats';
import { DateRangePicker } from '@/components/analytics/date-range-picker';

export default function CampaignsPage() {
  const [date, setDate] = useState<DateRange | undefined>(undefined);

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Campaigns</h1>
          <p className="text-muted-foreground">View and manage your past and current campaigns.</p>
        </div>
        <Button asChild>
          <Link href="/campaigns/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Campaign
          </Link>
        </Button>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Stats</h2>
            <DateRangePicker date={date} setDate={setDate} />
        </div>
        <CampaignStats date={date} />
      </div>

      <CampaignsTable dateRange={date} />
    </div>
  );
}
