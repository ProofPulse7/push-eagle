
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCampaignState } from '@/context/campaign-context';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, Lock, Calendar as CalendarIcon, PlusCircle, ChevronDown, Check } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

const Section = ({ title, description, children }: { title: string, description?: string, children: React.ReactNode }) => (
    <div className="space-y-4">
        <div>
            <h3 className="text-lg font-medium">{title}</h3>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div>{children}</div>
    </div>
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

const segments = [
    { id: 'all', name: 'All Subscribers', count: '0' },
    { id: 'high-value', name: 'High-Value Customers', count: '15,200' },
    { id: 'new-subs', name: 'New Subscribers (Last 30 Days)', count: '8,430' },
    { id: 'windows', name: 'Windows Users', count: '565,794' },
];

export default function CampaignDetailsPage() {
    const router = useRouter();
    const {
        sendingOption,
        setSendingOption,
        scheduledDate,
        setScheduledDate,
        scheduledTime,
        setScheduledTime,
        segmentId,
        setSegmentId,
    } = useCampaignState();
    const [campaignType, setCampaignType] = useState('regular');
    const [expiryDate, setExpiryDate] = useState<Date | undefined>(new Date());
    const [expiryTime, setExpiryTime] = useState('10:00 AM');
    const [searchSegment, setSearchSegment] = useState('');
    const [isSegmentPopoverOpen, setIsSegmentPopoverOpen] = useState(false);

    const filteredSegments = segments.filter(segment =>
        segment.name.toLowerCase().includes(searchSegment.toLowerCase())
    );

    return (
        <div className="bg-muted/40 min-h-screen">
            <div className="max-w-3xl mx-auto py-8 sm:py-12 px-4">
                <div className="flex items-center gap-4 mb-8">
                    <Button variant="outline" size="icon" asChild>
                        <Link href="/campaigns">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="sr-only">Back to Campaigns</span>
                        </Link>
                    </Button>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Campaign details</h1>
                </div>

                <Card>
                    <CardContent className="p-6 sm:p-8 space-y-8">
                        <Section title="Sending options">
                            <RadioGroup value={sendingOption} onValueChange={setSendingOption} className="space-y-4">
                                <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="now" id="now" />
                                        <Label htmlFor="now">Send Now</Label>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center space-x-2">
                                            <RadioGroupItem value="schedule" id="schedule" />
                                            <Label htmlFor="schedule">Schedule</Label>
                                        </div>
                                        {sendingOption === 'schedule' && (
                                            <div className="flex items-center gap-2">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            id="schedule-date"
                                                            variant={"outline"}
                                                            className={cn(
                                                                "w-[240px] justify-start text-left font-normal",
                                                                !scheduledDate && "text-muted-foreground"
                                                            )}
                                                        >
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {scheduledDate ? format(scheduledDate, "PPP") : <span>Pick a date</span>}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0">
                                                        <Calendar
                                                            mode="single"
                                                            selected={scheduledDate}
                                                            onSelect={setScheduledDate}
                                                            disabled={(date) =>
                                                                date < new Date(new Date().setHours(0, 0, 0, 0))
                                                            }
                                                            showOutsideDays={false}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                <Select value={scheduledTime} onValueChange={setScheduledTime}>
                                                    <SelectTrigger id="schedule-time" aria-label="Time" className="w-[140px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {timeOptions.map(time => (
                                                            <SelectItem key={time} value={time}>{time}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </RadioGroup>
                        </Section>

                        <Separator />

                        <Section title="Campaign type" description="Please select the type of campaign you want to send">
                             <RadioGroup value={campaignType} onValueChange={setCampaignType} className="space-y-4">
                                <div className="border rounded-md p-4 flex justify-between items-start">
                                    <div className="flex items-start gap-4">
                                        <RadioGroupItem value="regular" id="regular" className="mt-1" />
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="regular" className="font-semibold cursor-pointer">Regular campaign</Label>
                                            <p className="text-sm text-muted-foreground">Send a campaign about your sale or products</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="border rounded-md p-4">
                                    <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                                        <div className="flex items-center gap-4">
                                            <RadioGroupItem value="flash" id="flash" />
                                            <div className="grid gap-1.5">
                                                <Label htmlFor="flash" className="font-semibold cursor-pointer">Flash sale</Label>
                                                <p className="text-sm text-muted-foreground">Send a campaign with an expiry date on it</p>
                                            </div>
                                        </div>
                                        {campaignType === 'flash' && (
                                            <div className="sm:pl-10 flex items-center gap-2">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Button
                                                            id="expiry-date"
                                                            variant={"outline"}
                                                            className={cn(
                                                                "w-full sm:w-[240px] justify-start text-left font-normal",
                                                                !expiryDate && "text-muted-foreground"
                                                            )}
                                                        >
                                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                                            {expiryDate ? format(expiryDate, "PPP") : <span>Pick an expiry date</span>}
                                                        </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0">
                                                        <Calendar
                                                            mode="single"
                                                            selected={expiryDate}
                                                            onSelect={setExpiryDate}
                                                            disabled={(date) =>
                                                                date < new Date(new Date().setHours(0, 0, 0, 0))
                                                            }
                                                            showOutsideDays={false}
                                                            initialFocus
                                                        />
                                                    </PopoverContent>
                                                </Popover>
                                                <Select value={expiryTime} onValueChange={setExpiryTime}>
                                                    <SelectTrigger id="expiry-time" aria-label="Time" className="w-[140px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {timeOptions.map(time => (
                                                            <SelectItem key={time} value={time}>{time}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </RadioGroup>
                        </Section>

                        <Separator />

                        <Section title="Segments" description="Select a segment that you would like to send the campaign to">
                             <Popover open={isSegmentPopoverOpen} onOpenChange={setIsSegmentPopoverOpen}>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-between">
                                        <span>
                                            {segments.find(s => s.id === segmentId)?.name}
                                            ({segments.find(s => s.id === segmentId)?.count} subscribers)
                                        </span>
                                        <ChevronDown className="h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                                    <div className="p-2 border-b">
                                        <Input
                                            placeholder="Search segments..."
                                            value={searchSegment}
                                            onChange={e => setSearchSegment(e.target.value)}
                                            className="h-9"
                                        />
                                    </div>
                                    <div className="p-2 border-b">
                                        <Button variant="ghost" className="w-full justify-start" asChild>
                                            <Link href="/segments/new">
                                                <PlusCircle className="mr-2 h-4 w-4" />
                                                Create new segment
                                            </Link>
                                        </Button>
                                    </div>
                                    <div className="p-1">
                                        {filteredSegments.map(segment => (
                                            <div
                                                key={segment.id}
                                                className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                                                onClick={() => {
                                                    setSegmentId(segment.id);
                                                    setIsSegmentPopoverOpen(false);
                                                }}
                                            >
                                                <div className="w-4">
                                                    {segmentId === segment.id && <Check className="h-4 w-4" />}
                                                </div>
                                                <Label className="font-normal cursor-pointer w-full">
                                                    {segment.name} ({segment.count} subscribers)
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </PopoverContent>
                             </Popover>
                        </Section>
                        
                        <Separator />

                        <Section title="Advanced campaign settings">
                           <div className="flex items-start justify-between rounded-lg border p-4">
                                <div className="space-y-1">
                                    <Label htmlFor="smart-delivery" className="flex items-center gap-2">
                                        <Checkbox id="smart-delivery" />
                                        <span>Smart delivery</span>
                                    </Label>
                                    <CardDescription>
                                        Personalize the delivery time of your campaign for each subscriber by sending them the notification when they are most likely to be active
                                    </CardDescription>
                                </div>
                           </div>
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
