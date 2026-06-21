'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useCampaignState } from '@/context/campaign-context';
import { useSettings } from '@/context/settings-context';
import { CampaignDateTimeFields } from '@/components/campaigns/campaign-date-time-fields';
import { buildAudienceSegmentsFromCache } from '@/lib/client/optimistic-campaigns';
import { useSubscriberAudienceSync } from '@/hooks/use-subscriber-audience-sync';
import { cn } from '@/lib/utils';

type AudienceSegment = {
  id: string;
  name: string;
  count: number;
};

const OptionCard = ({
  selected,
  title,
  description,
  id,
  trailing,
}: {
  selected: boolean;
  title: string;
  description: string;
  id: string;
  trailing?: ReactNode;
}) => {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-background',
      )}
    >
      <RadioGroupItem id={id} value={id} className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-base font-semibold leading-none">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {trailing ? <div className="shrink-0 lg:ml-4">{trailing}</div> : null}
      </div>
    </label>
  );
};

export default function CampaignDetailsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { shopDomain: settingsShopDomain } = useSettings();
  const [queryShop, setQueryShop] = useState('');
  const shopDomain = queryShop || settingsShopDomain || '';
  const {
    sendingOption,
    setSendingOption,
    segmentId,
    setSegmentId,
    smartDeliver,
    setSmartDeliver,
    flashSaleEnabled,
    setFlashSaleEnabled,
    scheduledDate,
    setScheduledDate,
    scheduledTime,
    setScheduledTime,
    flashSaleExpiresAt,
    setFlashSaleExpiresAt,
    flashSaleExpiresTime,
    setFlashSaleExpiresTime,
  } = useCampaignState();

  const [segments, setSegments] = useState<AudienceSegment[]>(() =>
    shopDomain ? buildAudienceSegmentsFromCache(queryClient, shopDomain) : [{ id: 'all', name: 'All Subscribers', count: 0 }],
  );
  const [audienceError, setAudienceError] = useState<string | null>(null);

  useSubscriberAudienceSync(setSegments, segmentId, setSegmentId);

  useEffect(() => {
    setQueryShop(new URLSearchParams(window.location.search).get('shop') || '');
  }, []);

  const editorHref = queryShop
    ? `/campaigns/new/editor?shop=${encodeURIComponent(queryShop)}`
    : '/campaigns/new/editor';

  useEffect(() => {
    router.prefetch(editorHref);
  }, [editorHref, router]);

  useEffect(() => {
    if (!shopDomain) {
      return;
    }

    const cached = buildAudienceSegmentsFromCache(queryClient, shopDomain);
    if (cached.length > 0) {
      setSegments(cached);
      if (!cached.some((item) => item.id === segmentId)) {
        setSegmentId(cached[0].id);
      }
    }

    let active = true;
    setAudienceError(null);

    fetch(`/api/campaigns/audience?shop=${encodeURIComponent(shopDomain)}`)
      .then((response) => response.json())
      .then((data) => {
        if (!active) {
          return;
        }

        if (!data?.ok || !Array.isArray(data.segments)) {
          setAudienceError(typeof data?.error === 'string' ? data.error : 'Failed to refresh audience data.');
          return;
        }

        const nextSegments = data.segments.map((segment: { id: string; name: string; count: number }) => ({
          id: String(segment.id),
          name: String(segment.name),
          count: Number(segment.count ?? 0),
        }));

        if (nextSegments.length > 0) {
          setSegments(nextSegments);
          if (!nextSegments.some((item: AudienceSegment) => item.id === segmentId)) {
            setSegmentId(nextSegments[0].id);
          }
        }
      })
      .catch(() => {
        if (active && cached.length === 0) {
          setAudienceError('Failed to load subscribers and segments for this store.');
        }
      });

    return () => {
      active = false;
    };
  }, [queryClient, shopDomain]);

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === segmentId) ?? segments[0],
    [segmentId, segments],
  );

  const campaignsHref = queryShop
    ? `/campaigns?shop=${encodeURIComponent(queryShop)}`
    : '/campaigns';

  const campaignType = flashSaleEnabled ? 'flash' : 'regular';
  const today = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);

  return (
    <div className="min-h-screen bg-[#f6f6fb] px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto max-w-[920px]">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl bg-white" asChild>
            <Link href={campaignsHref}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Campaign details</h1>
        </div>

        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-5 p-5 md:p-6">
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">Sending options</h2>
              <RadioGroup
                value={sendingOption === 'schedule' ? 'schedule' : 'now'}
                onValueChange={(value) => setSendingOption(value === 'schedule' ? 'schedule' : 'now')}
                className="space-y-3"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
                  <label htmlFor="send-now" className="flex cursor-pointer items-center gap-2">
                    <RadioGroupItem id="send-now" value="now" />
                    <span className="text-sm font-medium">Send Now</span>
                  </label>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <label htmlFor="send-schedule" className="flex shrink-0 cursor-pointer items-center gap-2">
                      <RadioGroupItem id="send-schedule" value="schedule" />
                      <span className="text-sm font-medium">Schedule</span>
                    </label>
                    {sendingOption === 'schedule' ? (
                      <CampaignDateTimeFields
                        date={scheduledDate}
                        time={scheduledTime}
                        onDateChange={setScheduledDate}
                        onTimeChange={setScheduledTime}
                        minDate={today}
                        variant="inline"
                      />
                    ) : null}
                  </div>
                </div>
              </RadioGroup>
            </section>

            <Separator />

            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Campaign type</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Select the type of campaign you want to send</p>
              </div>
              <RadioGroup
                value={campaignType}
                onValueChange={(value) => setFlashSaleEnabled(value === 'flash')}
                className="flex flex-col gap-3"
              >
                <OptionCard
                  id="regular"
                  selected={campaignType === 'regular'}
                  title="Regular campaign"
                  description="Send a campaign about your sale or products"
                />
                <OptionCard
                  id="flash"
                  selected={campaignType === 'flash'}
                  title="Flash sale"
                  description="Send a campaign with an expiry date on it"
                  trailing={
                    flashSaleEnabled ? (
                      <CampaignDateTimeFields
                        date={flashSaleExpiresAt}
                        time={flashSaleExpiresTime}
                        onDateChange={setFlashSaleExpiresAt}
                        onTimeChange={setFlashSaleExpiresTime}
                        minDate={today}
                        variant="compact"
                        className="w-full lg:w-auto"
                      />
                    ) : null
                  }
                />
              </RadioGroup>
            </section>

            <Separator />

            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Segments</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">Select the audience for this campaign</p>
              </div>
              <Select value={selectedSegment?.id ?? 'all'} onValueChange={setSegmentId}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 text-sm font-medium">
                  <SelectValue>
                    {selectedSegment ? `${selectedSegment.name} (${selectedSegment.count.toLocaleString()} subscribers)` : 'Select segment'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {segments.map((segment) => (
                    <SelectItem key={segment.id} value={segment.id}>
                      {segment.name} ({segment.count.toLocaleString()} subscribers)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {audienceError ? <p className="text-sm text-destructive">{audienceError}</p> : null}
            </section>

            <Separator />

            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Advanced campaign settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setSmartDeliver(!smartDeliver)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                  smartDeliver ? 'border-primary bg-primary/5' : 'border-border bg-background',
                )}
              >
                <span
                  className={cn(
                    'mt-1 inline-flex h-5 w-5 rounded-full border-2 transition-colors',
                    smartDeliver ? 'border-primary ring-4 ring-primary/15' : 'border-primary/60',
                  )}
                >
                  <span
                    className={cn(
                      'm-auto h-2.5 w-2.5 rounded-full transition-opacity',
                      smartDeliver ? 'bg-primary opacity-100' : 'opacity-0',
                    )}
                  />
                </span>
                <div>
                  <p className="text-sm font-medium">Smart delivery</p>
                  <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">
                    Send each notification when the subscriber is most likely to be active
                  </p>
                </div>
              </button>
            </section>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end">
          <Button
            size="default"
            className="h-10 min-w-[120px] rounded-xl bg-primary px-6 text-sm font-semibold"
            asChild
          >
            <Link href={editorHref} prefetch>
              Continue
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
