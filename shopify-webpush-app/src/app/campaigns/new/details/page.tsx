'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useCampaignState } from '@/context/campaign-context';
import { useSettings } from '@/context/settings-context';
import { buildAudienceSegmentsFromCache } from '@/lib/client/optimistic-campaigns';
import { buildWizardPath, readWizardQueryParams } from '@/lib/client/campaign-wizard-bridge';
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
  const queryClient = useQueryClient();
  const { shopDomain: settingsShopDomain } = useSettings();
  const [queryShop, setQueryShop] = useState('');
  const [wizardQuery, setWizardQuery] = useState({ draftId: '', duplicateId: '' });
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
    editingCampaignId,
  } = useCampaignState();

  const [segments, setSegments] = useState<AudienceSegment[]>(() =>
    shopDomain ? buildAudienceSegmentsFromCache(queryClient, shopDomain) : [{ id: 'all', name: 'All Subscribers', count: 0 }],
  );
  const [audienceError, setAudienceError] = useState<string | null>(null);

  useEffect(() => {
    const params = readWizardQueryParams();
    setQueryShop(params.shop);
    setWizardQuery({ draftId: params.draftId, duplicateId: params.duplicateId });
  }, []);

  const wizardOptions = useMemo(
    () => ({
      draft: wizardQuery.draftId || undefined,
      duplicate: wizardQuery.duplicateId || undefined,
    }),
    [wizardQuery.draftId, wizardQuery.duplicateId],
  );

  useEffect(() => {
    if (!shopDomain) {
      return;
    }

    const cached = buildAudienceSegmentsFromCache(queryClient, shopDomain);
    if (cached.length > 0) {
      setSegments(cached);
      if (!editingCampaignId && !cached.some((item) => item.id === segmentId) && (segmentId === 'all' || !segmentId)) {
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
          if (!editingCampaignId && !nextSegments.some((item: AudienceSegment) => item.id === segmentId) && (segmentId === 'all' || !segmentId)) {
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
  }, [editingCampaignId, queryClient, segmentId, shopDomain]);

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === segmentId) ?? segments[0],
    [segmentId, segments],
  );

  const campaignsHref = queryShop
    ? `/campaigns?shop=${encodeURIComponent(queryShop)}`
    : '/campaigns';

  const editorHref = buildWizardPath('/campaigns/new/editor', shopDomain, wizardOptions);

  useEffect(() => {
    router.prefetch(editorHref);
  }, [editorHref, router]);

  const campaignType = flashSaleEnabled ? 'flash' : 'regular';

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
                className="flex flex-wrap gap-4"
              >
                <label htmlFor="send-now" className="flex cursor-pointer items-center gap-2">
                  <RadioGroupItem id="send-now" value="now" />
                  <span className="text-sm font-medium">Send Now</span>
                </label>
                <label htmlFor="send-schedule" className="flex cursor-pointer items-center gap-2">
                  <RadioGroupItem id="send-schedule" value="schedule" />
                  <span className="text-sm font-medium">Schedule</span>
                </label>
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
                className="grid gap-3 md:grid-cols-2"
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
