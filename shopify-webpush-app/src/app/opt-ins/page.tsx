
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
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
import { PageLoadingShell } from '@/components/ui/loading-ui';
import {
  useOptInSettings,
  useSaveOptInSettings,
} from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { useToast } from '@/hooks/use-toast';
import { queryKeys } from '@/lib/client/query-keys';
import { hasPendingSettings, mergePendingSettings, writePendingSettings } from '@/lib/client/pending-settings';
import type { OptInPromptStatsBundle, OptInPromptTypeStats } from '@/lib/types/opt-in-stats';

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

const emptyTypeStats: OptInPromptTypeStats = {
  views: 0,
  clicks: 0,
  conversions: 0,
  conversionPercent: 0,
  clickConversionPercent: 0,
};

const emptyStatsBundle: OptInPromptStatsBundle = {
  browser: emptyTypeStats,
  custom: emptyTypeStats,
  totals: {
    views: 0,
    clicks: 0,
    conversions: 0,
    conversionPercent: 0,
    avgConversionPercent: 0,
    avgClickConversionPercent: 0,
  },
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const parseOptInStats = (data: Record<string, unknown> | null | undefined): OptInPromptStatsBundle => {
  if (!data?.stats || typeof data.stats !== 'object') {
    return emptyStatsBundle;
  }

  const stats = data.stats as Partial<OptInPromptStatsBundle>;
  const browser = { ...emptyTypeStats, ...(stats.browser ?? {}) };
  const custom = { ...emptyTypeStats, ...(stats.custom ?? {}) };
  const totals = { ...emptyStatsBundle.totals, ...(stats.totals ?? {}) };

  return { browser, custom, totals };
};

export default function OptInsPage() {
  const shopDomain = useShopDomain();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const cachedOptIn = shopDomain
    ? queryClient.getQueryData<Record<string, unknown>>(queryKeys.optIn(shopDomain))
    : undefined;
  const { data: optInQueryData, isLoading, isFetching } = useOptInSettings({ refreshStats: true });
  const optInData = (optInQueryData ?? cachedOptIn) as Record<string, unknown> | undefined;
  const saveOptInMutation = useSaveOptInSettings();
  const [selectedPromptType, setSelectedPromptType] = useState<'browser' | 'custom' | 'off'>('custom');
  const hasCachedOrLiveData =
    Boolean(optInData) || Boolean(shopDomain && hasPendingSettings(shopDomain, 'optIn'));
  const showInitialLoad = !hasCachedOrLiveData && (isLoading || !shopDomain);

  const mergedSettings = useMemo(() => {
    if (!shopDomain) {
      return null;
    }

    return mergePendingSettings(shopDomain, 'optIn', optInData?.ok ? optInData : null);
  }, [shopDomain, optInData]);

  const livePromptType = mergedSettings?.promptType === 'browser'
    ? 'browser'
    : mergedSettings?.promptType === 'off'
      ? 'off'
      : 'custom';
  const iosWidgetEnabled = mergedSettings?.iosWidgetEnabled !== false;
  const promptStats = useMemo(() => parseOptInStats(optInData), [optInData]);
  const activeStats = livePromptType === 'browser'
    ? promptStats.browser
    : livePromptType === 'custom'
      ? promptStats.custom
      : emptyTypeStats;
  const livePromptLabel = livePromptType === 'browser'
    ? 'Browser'
    : livePromptType === 'off'
      ? 'Off'
      : 'Custom';

  useEffect(() => {
    if (mergedSettings) {
      const next = mergedSettings.promptType;
      setSelectedPromptType(next === 'browser' || next === 'off' ? next : 'custom');
    }
  }, [mergedSettings?.promptType]);

  const settingsSummary = useMemo(() => {
    if (!mergedSettings || (!optInData?.ok && !mergedSettings.title)) {
      return null;
    }

    return {
      title: String(mergedSettings.title ?? 'Subscribe for updates'),
      position: `${mergedSettings.desktopPosition ?? 'top-center'} (desktop), ${mergedSettings.mobilePosition ?? 'top'} (mobile)`,
      desktopDelay: Number(mergedSettings.desktopDelaySeconds ?? 0),
      mobileDelay: Number(mergedSettings.mobileDelaySeconds ?? 0),
      hideForDays: Number(mergedSettings.hideForDays ?? 0),
      maxDisplaysPerSession: Number(mergedSettings.maxDisplaysPerSession ?? 0),
    };
  }, [mergedSettings, optInData?.ok]);

  const updatePromptTypeSelection = (value: string) => {
    const next = value === 'browser' ? 'browser' : value === 'off' ? 'off' : 'custom';
    setSelectedPromptType(next);
  };

  const savePromptType = () => {
    if (!shopDomain) {
      return;
    }

    const body = { promptType: selectedPromptType };
    writePendingSettings(shopDomain, 'optIn', body);
    saveOptInMutation.mutate(body, {
      onSuccess: () => {
        toast({
          title: 'Prompt type saved',
          description: `${selectedPromptType === 'browser' ? 'Browser' : selectedPromptType === 'off' ? 'Off' : 'Custom'} prompt is now live.`,
        });
      },
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Failed to save prompt type',
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      },
    });
  };

  const updateIosWidgetEnabled = (checked: boolean) => {
    if (!shopDomain) {
      return;
    }

    const body = { iosWidgetEnabled: checked };
    writePendingSettings(shopDomain, 'optIn', body);
    saveOptInMutation.mutate(body, {
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Failed to update iOS widget',
          description: error instanceof Error ? error.message : 'Please try again.',
        });
      },
    });
  };

  const statusLabel = useMemo(() => {
    if (!settingsSummary) {
      return 'Using cached settings';
    }
    return `Live title: ${settingsSummary.title}`;
  }, [settingsSummary]);

  return (
    <PageLoadingShell
      title="Opt-ins"
      isLoading={showInitialLoad}
      hasData={hasCachedOrLiveData}
      isFetching={isFetching && hasCachedOrLiveData}
      pathname="/opt-ins"
    >
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            Opt-ins
            <Settings className="h-6 w-6 text-muted-foreground" />
        </h1>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Stats ({livePromptLabel} prompt — live)</h2>
        </div>
        <Card>
            <CardContent className="p-0">
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x">
                    <TopStat label="Total views" value={activeStats.views} tooltipText={`Impressions for the live ${livePromptLabel.toLowerCase()} opt-in prompt.`} />
                    <TopStat label="Total clicks" value={activeStats.clicks} tooltipText={`Allow/subscribe clicks for the live ${livePromptLabel.toLowerCase()} opt-in prompt.`} />
                    <TopStat label="Total subscribers" value={activeStats.conversions} tooltipText={`Successful subscriptions from the live ${livePromptLabel.toLowerCase()} opt-in prompt.`} />
                    <TopStat label="Overall conversion" value={formatPercent(activeStats.conversionPercent)} tooltipText="Subscribers divided by views for the live prompt." />
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
            <RadioGroup value={selectedPromptType} onValueChange={updatePromptTypeSelection} className="space-y-4">

              <div
                className={cn(
                  'rounded-lg border p-4 transition-all',
                  selectedPromptType === 'off' ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50'
                )}
              >
                <div className="flex items-center justify-between">
                    <div className="flex items-start gap-4">
                         <RadioGroupItem value="off" id="off-prompt" className="mt-1" />
                         <div className="grid gap-1.5">
                            <Label htmlFor="off-prompt" className="font-semibold text-base cursor-pointer">
                                Off
                            {livePromptType === 'off' && <Badge variant="default" className="ml-2">LIVE</Badge>}
                            {selectedPromptType === 'off' && livePromptType !== 'off' && <Badge variant="secondary" className="ml-2">SELECTED</Badge>}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                Hide both browser and custom opt-in prompts on your storefront
                            </p>
                        </div>
                    </div>
                </div>
              </div>
              
              <div
                className={cn(
                  'rounded-lg border p-4 transition-all',
                  selectedPromptType === 'browser' ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50'
                )}
              >
                <div className="flex items-center justify-between">
                    <div className="flex items-start gap-4">
                         <RadioGroupItem value="browser" id="browser-prompt" className="mt-1" />
                         <div className="grid gap-1.5">
                            <Label htmlFor="browser-prompt" className="font-semibold text-base cursor-pointer">
                                Browser Prompt
                            {livePromptType === 'browser' && <Badge variant="default" className="ml-2">LIVE</Badge>}
                            {selectedPromptType === 'browser' && livePromptType !== 'browser' && <Badge variant="secondary" className="ml-2">SELECTED</Badge>}
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
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <StatBlock label="Type" value="Native" />
                  <StatBlock label="Viewed" value={promptStats.browser.views} />
                  <StatBlock label="Clicks" value={promptStats.browser.clicks} />
                  <StatBlock label="Subscribed" value={promptStats.browser.conversions} />
                  <StatBlock label="Conversion %" value={formatPercent(promptStats.browser.conversionPercent)} />
                </div>
              </div>

              <div
                className={cn(
                  'rounded-lg border p-4 transition-all',
                  selectedPromptType === 'custom' ? 'border-primary bg-primary/5' : 'bg-card hover:bg-muted/50'
                )}
              >
                <div className="flex items-center justify-between">
                    <div className="flex items-start gap-4">
                         <RadioGroupItem value="custom" id="custom-prompt" className="mt-1" />
                         <div className="grid gap-1.5">
                            <Label htmlFor="custom-prompt" className="font-semibold text-base cursor-pointer">
                                Custom Prompt
                            {livePromptType === 'custom' && <Badge variant="default" className="ml-2">LIVE</Badge>}
                            {selectedPromptType === 'custom' && livePromptType !== 'custom' && <Badge variant="secondary" className="ml-2">SELECTED</Badge>}
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
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <StatBlock label="Type" value="Popup" />
                    <StatBlock label="Viewed" value={promptStats.custom.views} />
                    <StatBlock label="Clicks" value={promptStats.custom.clicks} />
                    <StatBlock label="Subscribed" value={promptStats.custom.conversions} />
                    <StatBlock label="Conversion %" value={formatPercent(promptStats.custom.conversionPercent)} />
                </div>
              </div>
            </RadioGroup>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={savePromptType}
                disabled={!shopDomain || selectedPromptType === livePromptType}
              >
                SAVE PROMPT TYPE
              </Button>
            </div>
            <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Settings status</p>
              <p>{statusLabel}</p>
              {settingsSummary ? (
                <p className="mt-1">
                  {livePromptType === 'off'
                    ? 'Both opt-in prompts are hidden. Existing subscribers can still receive notifications.'
                    : livePromptType === 'browser'
                    ? `Delays: ${settingsSummary.desktopDelay}s desktop / ${settingsSummary.mobileDelay}s mobile. Browser mode asks at most once per session and up to 3 times in 2 days.`
                    : `Position: ${settingsSummary.position}. Delays: ${settingsSummary.desktopDelay}s desktop / ${settingsSummary.mobileDelay}s mobile. Hide for ${settingsSummary.hideForDays} days, max ${settingsSummary.maxDisplaysPerSession} displays per session.`}
                </p>
              ) : null}
            </div>
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
                      onCheckedChange={(checked) => updateIosWidgetEnabled(!!checked)}
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
    </PageLoadingShell>
  );
}
