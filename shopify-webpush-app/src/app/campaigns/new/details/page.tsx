'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useCampaignState } from '@/context/campaign-context';
import { useSettings } from '@/context/settings-context';
import { cn } from '@/lib/utils';

type AudienceSegment = {
  id: string;
  name: string;
  count: number;
};

const OptionCard = ({
  selected,
  onClick,
  title,
  description,
  id,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  id: string;
}) => {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-4 transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-background',
      )}
    >
      <RadioGroupItem id={id} value={id} className="mt-1" />
      <div className="space-y-1">
        <p className="text-base font-semibold leading-none">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </label>
  );
};

export default function CampaignDetailsPage() {
  const router = useRouter();
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
  } = useCampaignState();

  const [segments, setSegments] = useState<AudienceSegment[]>([{ id: 'all', name: 'All Subscribers', count: 0 }]);
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [audienceError, setAudienceError] = useState<string | null>(null);

  useEffect(() => {
    setQueryShop(new URLSearchParams(window.location.search).get('shop') || '');
  }, []);

  useEffect(() => {
    if (!shopDomain) {
      return;
    }

    let active = true;
    setLoadingAudience(true);
    setAudienceError(null);

    fetch(`/api/campaigns/audience?shop=${encodeURIComponent(shopDomain)}`)
      .then((response) => response.json())
      .then((data) => {
        if (!active) {
          return;
        }

        if (!data?.ok || !Array.isArray(data.segments)) {
          setAudienceError(typeof data?.error === 'string' ? data.error : 'Failed to load subscribers and segments for this store.');
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
        if (active) {
          setAudienceError('Failed to load subscribers and segments for this store.');
        }
      })
      .finally(() => {
        if (active) {
          setLoadingAudience(false);
        }
      });

    return () => {
      active = false;
    };
  }, [segmentId, setSegmentId, shopDomain]);

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === segmentId) ?? segments[0],
    [segmentId, segments],
  );

  const scheduleHref = queryShop
    ? `/campaigns/new/schedule?shop=${encodeURIComponent(queryShop)}`
    : '/campaigns/new/schedule';

  const editorHref = queryShop
    ? `/campaigns/new/editor?shop=${encodeURIComponent(queryShop)}`
    : '/campaigns/new/editor';

  const campaignType = flashSaleEnabled ? 'flash' : 'regular';

  return (
    <div className="min-h-screen bg-[#f6f6fb] px-4 py-8 md:px-8 md:py-10">
      <div className="mx-auto max-w-[980px]">
        <div className="mb-8 flex items-center gap-4">
          <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl bg-white" asChild>
            <Link href={editorHref}>
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Campaign details</h1>
        </div>

        <Card className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-10 p-8 md:p-10">
            <section className="space-y-5">
              <h2 className="text-[1.6rem] font-semibold text-foreground">Sending options</h2>
              <RadioGroup
                value={sendingOption === 'schedule' ? 'schedule' : 'now'}
                onValueChange={(value) => setSendingOption(value === 'schedule' ? 'schedule' : 'now')}
                className="flex flex-wrap gap-6"
              >
                <label htmlFor="send-now" className="flex cursor-pointer items-center gap-3">
                  <RadioGroupItem id="send-now" value="now" />
                  <span className="text-lg font-medium">Send Now</span>
                </label>
                <label htmlFor="send-schedule" className="flex cursor-pointer items-center gap-3">
                  <RadioGroupItem id="send-schedule" value="schedule" />
                  <span className="text-lg font-medium">Schedule</span>
                </label>
              </RadioGroup>
            </section>

            <Separator />

            <section className="space-y-5">
              <div>
                <h2 className="text-[1.6rem] font-semibold text-foreground">Campaign type</h2>
                <p className="mt-1 text-base text-muted-foreground">Please select the type of campaign you want to send</p>
              </div>
              <RadioGroup
                value={campaignType}
                onValueChange={(value) => setFlashSaleEnabled(value === 'flash')}
                className="space-y-5"
              >
                <OptionCard
                  id="regular"
                  selected={campaignType === 'regular'}
                  onClick={() => setFlashSaleEnabled(false)}
                  title="Regular campaign"
                  description="Send a campaign about your sale or products"
                />
                <OptionCard
                  id="flash"
                  selected={campaignType === 'flash'}
                  onClick={() => setFlashSaleEnabled(true)}
                  title="Flash sale"
                  description="Send a campaign with an expiry date on it"
                />
              </RadioGroup>
            </section>

            <Separator />

            <section className="space-y-5">
              <div>
                <h2 className="text-[1.6rem] font-semibold text-foreground">Segments</h2>
                <p className="mt-1 text-base text-muted-foreground">Select a segment that you would like to send the campaign to</p>
              </div>
              <Select value={selectedSegment?.id ?? 'all'} onValueChange={setSegmentId}>
                <SelectTrigger className="h-14 rounded-xl border-slate-200 bg-slate-50 text-base font-medium">
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
              {loadingAudience ? <p className="text-sm text-muted-foreground">Loading subscribers and segments...</p> : null}
              {audienceError ? <p className="text-sm text-destructive">{audienceError}</p> : null}
            </section>

            <Separator />

            <section className="space-y-5">
              <div>
                <h2 className="text-[1.6rem] font-semibold text-foreground">Advanced campaign settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setSmartDeliver(!smartDeliver)}
                className={cn(
                  'flex w-full items-start gap-4 rounded-2xl border px-4 py-5 text-left transition-colors',
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
                  <p className="text-lg font-medium">Smart delivery</p>
                  <p className="mt-1 max-w-2xl text-base leading-6 text-muted-foreground">
                    Personalize the delivery time of your campaign for each subscriber by sending them the notification when they are most likely to be active
                  </p>
                </div>
              </button>
            </section>
          </CardContent>
        </Card>

        <div className="mt-8 flex justify-end">
          <Button
            size="lg"
            className="h-12 min-w-[140px] rounded-xl bg-primary px-8 text-base font-semibold"
            onClick={() => router.push(scheduleHref)}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
