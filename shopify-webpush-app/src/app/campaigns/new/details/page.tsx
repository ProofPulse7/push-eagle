'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, Calendar as CalendarIcon, Check, ChevronDown, Clock, PlusCircle } from 'lucide-react';

import { useCampaignState } from '@/context/campaign-context';
import { useSettings } from '@/context/settings-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

type AudienceSegment = {
  id: string;
  name: string;
  count: number;
};

const Section = ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
  <section className="space-y-4">
    <div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {children}
  </section>
);

const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const date = new Date();
  date.setHours(Math.floor(i / 2), (i % 2) * 30, 0, 0);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
});

const combineDateAndTime = (date: Date | undefined, time: string): Date | undefined => {
  if (!date) {
    return undefined;
  }

  const match = time.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
  if (!match) {
    return date;
  }

  const [, hourValue, minuteValue, meridiem] = match;
  let hours = Number(hourValue) % 12;
  if (meridiem.toUpperCase() === 'PM') {
    hours += 12;
  }

  const nextDate = new Date(date);
  nextDate.setHours(hours, Number(minuteValue), 0, 0);
  return nextDate;
};

const timeFromDate = (date: Date | undefined) => {
  if (!date) {
    return '10:00 AM';
  }

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export default function CampaignDetailsPage() {
  const router = useRouter();
  const { shopDomain } = useSettings();
  const {
    sendingOption,
    setSendingOption,
    scheduledDate,
    setScheduledDate,
    scheduledTime,
    setScheduledTime,
    segmentId,
    setSegmentId,
    smartDeliver,
    setSmartDeliver,
    flashSaleEnabled,
    setFlashSaleEnabled,
    flashSaleDiscountPercent,
    setFlashSaleDiscountPercent,
    flashSaleOriginalPrice,
    setFlashSaleOriginalPrice,
    flashSaleSalePrice,
    setFlashSaleSalePrice,
    flashSaleExpiresAt,
    setFlashSaleExpiresAt,
    flashSaleUrgencyText,
    setFlashSaleUrgencyText,
    recurringPattern,
    setRecurringPattern,
  } = useCampaignState();

  const [campaignType, setCampaignType] = useState<'regular' | 'flash'>(flashSaleEnabled ? 'flash' : 'regular');
  const [flashExpiryTime, setFlashExpiryTime] = useState(() => timeFromDate(flashSaleExpiresAt));
  const [searchSegment, setSearchSegment] = useState('');
  const [isSegmentPopoverOpen, setIsSegmentPopoverOpen] = useState(false);
  const [segments, setSegments] = useState<AudienceSegment[]>([{ id: 'all', name: 'All Subscribers', count: 0 }]);

  useEffect(() => {
    if (!shopDomain) {
      return;
    }

    let active = true;
    fetch(`/api/campaigns/audience?shop=${encodeURIComponent(shopDomain)}`)
      .then((response) => response.json())
      .then((data) => {
        if (!active || !data?.ok || !Array.isArray(data.segments)) {
          return;
        }

        const nextSegments = data.segments.map((segment: { id: string; name: string; count: number }) => ({
          id: String(segment.id),
          name: String(segment.name),
          count: Number(segment.count ?? 0),
        }));

        if (nextSegments.length === 0) {
          return;
        }

        setSegments(nextSegments);
        if (!nextSegments.some((item) => item.id === segmentId)) {
          setSegmentId(nextSegments[0].id);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [segmentId, setSegmentId, shopDomain]);

  useEffect(() => {
    setCampaignType(flashSaleEnabled ? 'flash' : 'regular');
  }, [flashSaleEnabled]);

  const filteredSegments = useMemo(
    () => segments.filter((segment) => segment.name.toLowerCase().includes(searchSegment.toLowerCase())),
    [searchSegment, segments],
  );

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === segmentId) ?? segments[0],
    [segmentId, segments],
  );

  const handleCampaignTypeChange = (nextType: 'regular' | 'flash') => {
    setCampaignType(nextType);
    setFlashSaleEnabled(nextType === 'flash');
  };

  const handleFlashDateChange = (nextDate: Date | undefined) => {
    setFlashSaleExpiresAt(combineDateAndTime(nextDate, flashExpiryTime));
  };

  const handleFlashTimeChange = (nextTime: string) => {
    setFlashExpiryTime(nextTime);
    setFlashSaleExpiresAt(combineDateAndTime(flashSaleExpiresAt, nextTime));
  };

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/campaigns/new/editor">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to campaign creator</span>
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Campaign details</h1>
        </div>

        <Card>
          <CardContent className="space-y-8 p-6 sm:p-8">
            <Section title="Sending options">
              <RadioGroup value={sendingOption} onValueChange={setSendingOption} className="space-y-4">
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value="now" id="send-now" />
                    <Label htmlFor="send-now">Send now</Label>
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <RadioGroupItem value="schedule" id="send-schedule" />
                    <Label htmlFor="send-schedule">Schedule</Label>
                    {sendingOption === 'schedule' ? (
                      <>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn('w-full justify-start text-left sm:w-[230px]', !scheduledDate && 'text-muted-foreground')}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {scheduledDate ? format(scheduledDate, 'PPP') : 'Pick a date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={scheduledDate}
                              onSelect={setScheduledDate}
                              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <Select value={scheduledTime} onValueChange={setScheduledTime}>
                          <SelectTrigger className="w-full sm:w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {timeOptions.map((time) => (
                              <SelectItem key={time} value={time}>
                                {time}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <RadioGroupItem value="recurring" id="send-recurring" />
                    <Label htmlFor="send-recurring">Recurring</Label>
                    {sendingOption === 'recurring' ? (
                      <Select value={recurringPattern} onValueChange={setRecurringPattern}>
                        <SelectTrigger className="w-full sm:w-[280px]">
                          <SelectValue placeholder="Select recurring pattern" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0 9 * * MON">Every Monday at 9:00 AM</SelectItem>
                          <SelectItem value="0 9 * * TUE">Every Tuesday at 9:00 AM</SelectItem>
                          <SelectItem value="0 9 * * WED">Every Wednesday at 9:00 AM</SelectItem>
                          <SelectItem value="0 9 * * THU">Every Thursday at 9:00 AM</SelectItem>
                          <SelectItem value="0 9 * * FRI">Every Friday at 9:00 AM</SelectItem>
                          <SelectItem value="0 9 * * MON,WED,FRI">Mon, Wed, Fri at 9:00 AM</SelectItem>
                          <SelectItem value="0 12 * * *">Daily at 12:00 PM</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                </div>
              </RadioGroup>
            </Section>

            <Separator />

            <Section title="Campaign type" description="Choose your campaign style.">
              <RadioGroup value={campaignType} onValueChange={(value) => handleCampaignTypeChange(value as 'regular' | 'flash')}>
                <div className="space-y-3">
                  <label htmlFor="campaign-regular" className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
                    <RadioGroupItem id="campaign-regular" value="regular" className="mt-1" />
                    <div>
                      <p className="font-medium">Regular campaign</p>
                      <p className="text-sm text-muted-foreground">Send a standard campaign for products, offers, or updates.</p>
                    </div>
                  </label>
                  <label htmlFor="campaign-flash" className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
                    <RadioGroupItem id="campaign-flash" value="flash" className="mt-1" />
                    <div>
                      <p className="font-medium">Flash sale</p>
                      <p className="text-sm text-muted-foreground">Add urgency with prices and expiration.</p>
                    </div>
                  </label>
                </div>
              </RadioGroup>
            </Section>

            <Separator />

            <Section
              title="Smart delivery"
              description="Deliver to each subscriber around their highest engagement window."
            >
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Enable smart delivery</p>
                    <p className="text-sm text-muted-foreground">Uses historical engagement timing to distribute sends.</p>
                  </div>
                  <Checkbox checked={smartDeliver} onCheckedChange={(checked) => setSmartDeliver(checked === true)} />
                </div>
                {smartDeliver ? (
                  <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    Delivery will roll out in optimized time windows over the next day.
                  </p>
                ) : null}
              </div>
            </Section>

            <Separator />

            <Section
              title="Flash sale settings"
              description="These values are used when Flash sale campaign type is selected."
            >
              <div className="space-y-4 rounded-lg border p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="discount-percent">Discount (%)</Label>
                    <Input
                      id="discount-percent"
                      type="number"
                      min={1}
                      max={99}
                      value={flashSaleDiscountPercent}
                      onChange={(event) => setFlashSaleDiscountPercent(Number(event.target.value || 0))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="urgency-text">Urgency text</Label>
                    <Input
                      id="urgency-text"
                      value={flashSaleUrgencyText}
                      onChange={(event) => setFlashSaleUrgencyText(event.target.value)}
                      placeholder="Limited time offer"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="original-price">Original price</Label>
                    <Input
                      id="original-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={flashSaleOriginalPrice}
                      onChange={(event) => setFlashSaleOriginalPrice(Number(event.target.value || 0))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sale-price">Sale price</Label>
                    <Input
                      id="sale-price"
                      type="number"
                      min={0}
                      step="0.01"
                      value={flashSaleSalePrice}
                      onChange={(event) => setFlashSaleSalePrice(Number(event.target.value || 0))}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn('w-full justify-start text-left sm:w-[230px]', !flashSaleExpiresAt && 'text-muted-foreground')}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {flashSaleExpiresAt ? format(flashSaleExpiresAt, 'PPP') : 'Pick expiry date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={flashSaleExpiresAt}
                        onSelect={handleFlashDateChange}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Select value={flashExpiryTime} onValueChange={handleFlashTimeChange}>
                    <SelectTrigger className="w-full sm:w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>

            <Separator />

            <Section title="Target audience">
              <Popover open={isSegmentPopoverOpen} onOpenChange={setIsSegmentPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span>
                      {selectedSegment?.name} ({Number(selectedSegment?.count ?? 0).toLocaleString()} subscribers)
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <div className="border-b p-2">
                    <Input
                      placeholder="Search segments..."
                      value={searchSegment}
                      onChange={(event) => setSearchSegment(event.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div className="border-b p-2">
                    <Button variant="ghost" className="w-full justify-start" asChild>
                      <Link href="/segments/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Create new segment
                      </Link>
                    </Button>
                  </div>
                  <div className="p-1">
                    {filteredSegments.map((segment) => (
                      <button
                        type="button"
                        key={segment.id}
                        className="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-accent"
                        onClick={() => {
                          setSegmentId(segment.id);
                          setIsSegmentPopoverOpen(false);
                        }}
                      >
                        <div className="w-4">{segmentId === segment.id ? <Check className="h-4 w-4" /> : null}</div>
                        <span className="text-sm">
                          {segment.name} ({segment.count.toLocaleString()} subscribers)
                        </span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </Section>
          </CardContent>
        </Card>

        <div className="mt-8 flex justify-end">
          <Button size="lg" onClick={() => router.push('/campaigns/new/editor')}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
