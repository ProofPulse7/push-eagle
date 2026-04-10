
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Settings, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const StatBlock = ({ label, value }: { label: string, value: string | number }) => (
    <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
    </div>
);

const TopStat = ({ label, value, tooltipText }: { label: string, value: string | number, tooltipText: string }) => (
    <div className="p-6 text-center flex flex-col items-center justify-center">
        <p className="text-3xl font-bold">{value}</p>
        <div className="flex items-center gap-1.5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{tooltipText}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    </div>
);


export default function OptInsPage() {
  const [promptType, setPromptType] = useState('browser');
  const [iosWidgetEnabled, setIosWidgetEnabled] = useState(true);

  return (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            Opt-ins
            <Settings className="h-6 w-6 text-muted-foreground" />
        </h1>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Stats</h2>
        </div>
        <Card>
            <CardContent className="p-0">
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x">
                    <TopStat label="Total viewers" value="9" tooltipText="The number of times the opt-in was shown to visitors." />
                    <TopStat label="Total subscribers" value="5" tooltipText="The number of visitors who subscribed through the opt-in." />
                    <TopStat label="Total conversions" value="55.6%" tooltipText="The percentage of viewers who became subscribers." />
                </div>
            </CardContent>
        </Card>
      </div>
      
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Prompt</CardTitle>
            <CardDescription>
              Configure the opt-in prompt shown for your store visitors.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={promptType} onValueChange={setPromptType} className="space-y-4">
              
              <div
                className={cn(
                  'rounded-lg border p-4 transition-all',
                  promptType === 'browser' ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50'
                )}
              >
                <div className="flex items-center justify-between">
                    <div className="flex items-start gap-4">
                         <RadioGroupItem value="browser" id="browser-prompt" className="mt-1" />
                         <div className="grid gap-1.5">
                            <Label htmlFor="browser-prompt" className="font-semibold text-base cursor-pointer">
                                Browser Prompt
                                {promptType === 'browser' && <Badge variant="default" className="ml-2">LIVE</Badge>}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                One step opt-in process for better results
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" asChild>
                      <Link href="/opt-ins/browser-prompt">Edit</Link>
                    </Button>
                </div>
                <Separator className="my-4" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatBlock label="Type" value="Popup" />
                    <StatBlock label="Viewed" value="9" />
                    <StatBlock label="Subscribed" value="5" />
                    <StatBlock label="Conversion %" value="55.6%" />
                </div>
              </div>

              <div
                className={cn(
                  'rounded-lg border p-4 transition-all',
                  promptType === 'custom' ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50'
                )}
              >
                <div className="flex items-center justify-between">
                    <div className="flex items-start gap-4">
                         <RadioGroupItem value="custom" id="custom-prompt" className="mt-1" />
                         <div className="grid gap-1.5">
                            <Label htmlFor="custom-prompt" className="font-semibold text-base cursor-pointer">
                                Custom Prompt
                                {promptType === 'custom' && <Badge variant="default" className="ml-2">LIVE</Badge>}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Give your store visitors more context with a customizable opt-in
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" asChild>
                      <Link href="/opt-ins/custom-prompt">Edit</Link>
                    </Button>
                </div>
                 <Separator className="my-4" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatBlock label="Type" value="Popup" />
                    <StatBlock label="Viewed" value="12" />
                    <StatBlock label="Subscribed" value="4" />
                    <StatBlock label="Conversion %" value="33.3%" />
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        <Card
          className={cn(
            'transition-all',
            'bg-card'
          )}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-start gap-4">
                    <Checkbox 
                        id="ios-widget" 
                        checked={iosWidgetEnabled}
                        onCheckedChange={(checked) => setIosWidgetEnabled(!!checked)}
                        className="mt-1"
                    />
                    <div className="grid gap-1.5">
                        <Label htmlFor="ios-widget" className="font-semibold text-base cursor-pointer">
                            iOS Widget
                            {iosWidgetEnabled && <Badge variant="default" className="ml-2">Active</Badge>}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            Get your subscribers to install your store as a home screen app before you send them a push notification.
                        </p>
                    </div>
                </div>
                <Button variant="outline" asChild>
                    <Link href="/opt-ins/ios-widget">Edit</Link>
                </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
