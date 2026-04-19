'use client';

import React, { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, TabletSmartphone, Zap } from 'lucide-react';

import { FlowNotificationCard } from '@/components/automations/flow-notification-card';
import { FlowStats } from '@/components/automations/flow-stats';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCachedJson } from '@/hooks/use-cached-json';
import { useSettings } from '@/context/settings-context';

type NotificationPreviewData = {
  title: string;
  message: string;
  iconUrl: string;
  heroUrl: string | null;
  windowsImageUrl?: string | null;
  macosImageUrl?: string | null;
  androidImageUrl?: string | null;
  siteName: string;
  actionButtons: Array<{ title: string; link: string }>;
};

type FlowNotification = {
  id: 'reminder-1' | 'reminder-2' | 'reminder-3';
  title: string;
  delay: string;
  status: 'Active' | 'Inactive';
  notification: NotificationPreviewData;
};

const flowData: {
  title: string;
  trigger: string;
  notifications: FlowNotification[];
} = {
  title: 'Welcome notifications',
  trigger: 'When a new visitor subscribes',
  notifications: [
    {
      id: 'reminder-1',
      title: 'Reminder 1',
      delay: '0 minutes',
      status: 'Inactive',
      notification: {
        title: 'You are subscribed',
        message: 'We will keep you posted with latest updates.',
        iconUrl: 'https://placehold.co/48x48.png',
        heroUrl: null,
        siteName: 'chrome.zahoorshop.com',
        actionButtons: [],
      },
    },
    {
      id: 'reminder-2',
      title: 'Reminder 2',
      delay: '3 minutes',
      status: 'Inactive',
      notification: {
        title: "We're glad to have you here!",
        message: "As an exclusive subscriber, you'll get our latest offers and products before anyone else!",
        iconUrl: 'https://placehold.co/48x48.png',
        heroUrl: 'https://placehold.co/728x360.png',
        siteName: 'chrome.zahoorshop.com',
        actionButtons: [{ title: 'Shop Now', link: 'https://example.com/shop' }],
      },
    },
    {
      id: 'reminder-3',
      title: 'Reminder 3',
      delay: '1 day',
      status: 'Active',
      notification: {
        title: 'Hey there! Anything specific caught your eye?',
        message: 'Our products are made with care, giving you the best!',
        iconUrl: 'https://placehold.co/48x48.png',
        heroUrl: 'https://placehold.co/728x360.png',
        siteName: 'chrome.zahoorshop.com',
        actionButtons: [
          { title: 'View Products', link: 'https://example.com/products' },
          { title: 'Special Offers', link: 'https://example.com/offers' },
        ],
      },
    },
  ],
};
type WelcomeRuleStepConfig = {
  enabled?: boolean;
  delayMinutes?: number;
  title?: string;
  body?: string;
  iconUrl?: string | null;
  imageUrl?: string | null;
  windowsImageUrl?: string | null;
  macosImageUrl?: string | null;
  androidImageUrl?: string | null;
  actionButtons?: Array<{ title: string; link: string }>;
};

type WelcomeDiagnosticsPayload = {
  ok?: boolean;
  shopDomain?: string;
  checkedAt?: string;
  processing?: {
    claimed?: number;
    sent?: number;
    failed?: number;
  };
  summary?: {
    reminder2?: {
      pending?: number;
      dueNow?: number;
      sent?: number;
      failed?: number;
      skipped?: number;
      processing?: number;
      delivered?: number;
      lastDeliveredAt?: string | null;
    };
    reminder3?: {
      pending?: number;
      dueNow?: number;
      sent?: number;
      failed?: number;
      skipped?: number;
      processing?: number;
      delivered?: number;
      lastDeliveredAt?: string | null;
    };
    staleProcessing?: number;
  };
  reminderMedia?: Record<string, {
    icon?: { present?: boolean; scheme?: string; normalized?: string | null };
    image?: { present?: boolean; scheme?: string; normalized?: string | null };
    windowsImage?: { present?: boolean; scheme?: string; normalized?: string | null };
    macosImage?: { present?: boolean; scheme?: string; normalized?: string | null };
    androidImage?: { present?: boolean; scheme?: string; normalized?: string | null };
  }>;
  inferredIssues?: string[];
  recentJobs?: Array<{
    id: string;
    stepKey: string;
    status: string;
    attempts: number;
    dueAt: string | null;
    sentAt: string | null;
    updatedAt: string | null;
    errorMessage: string | null;
    tokenId: number | null;
    subscriberId: number | null;
    externalId: string | null;
    tokenStatus: string | null;
    tokenLastSeenAt: string | null;
  }>;
};

const delayOptionsMinutes: Array<{ label: string; minutes: number }> = [
  { label: '0 minutes', minutes: 0 },
  { label: '3 minutes', minutes: 3 },
  { label: '5 minutes', minutes: 5 },
  { label: '10 minutes', minutes: 10 },
  { label: '15 minutes', minutes: 15 },
  { label: '20 minutes', minutes: 20 },
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '4 hours', minutes: 240 },
  { label: '6 hours', minutes: 360 },
  { label: '12 hours', minutes: 720 },
  { label: '1 day', minutes: 1440 },
  { label: '2 days', minutes: 2880 },
  { label: '3 days', minutes: 4320 },
  { label: '4 days', minutes: 5760 },
  { label: '7 days', minutes: 10080 },
  { label: '10 days', minutes: 14400 },
  { label: '15 days', minutes: 21600 },
  { label: '30 days', minutes: 43200 },
];

const delayLabelToMinutes = (delayLabel: string) => {
  const match = delayOptionsMinutes.find((item) => item.label === delayLabel);
  return match ? match.minutes : 0;
};

const delayMinutesToLabel = (delayMinutes: number) => {
  const match = delayOptionsMinutes.find((item) => item.minutes === delayMinutes);
  if (match) {
    return match.label;
  }

  if (delayMinutes % 1440 === 0) {
    const days = Math.floor(delayMinutes / 1440);
    return days === 1 ? '1 day' : `${days} days`;
  }

  if (delayMinutes % 60 === 0) {
    const hours = Math.floor(delayMinutes / 60);
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }

  return `${delayMinutes} minutes`;
};

const buildStepsConfigFromNotifications = (notifications: FlowNotification[]) => {
  return Object.fromEntries(
    notifications.map((notification) => [
      notification.id,
      {
        enabled: notification.status === 'Active',
        delayMinutes: delayLabelToMinutes(notification.delay),
        title: notification.notification.title,
        body: notification.notification.message,
        iconUrl: notification.notification.iconUrl ?? null,
        imageUrl: notification.notification.heroUrl ?? null,
        windowsImageUrl: notification.notification.windowsImageUrl ?? null,
        macosImageUrl: notification.notification.macosImageUrl ?? null,
        androidImageUrl: notification.notification.androidImageUrl ?? null,
        actionButtons: notification.notification.actionButtons ?? [],
      },
    ]),
  );
};

export default function WelcomeNotificationsPage() {
  const { shopDomain: settingsShop } = useSettings();
  const [queryShop, setQueryShop] = useState('');
  const shopDomain = queryShop || settingsShop || '';

  const [previewDevice, setPreviewDevice] = useState<'windows' | 'macos' | 'android' | 'ios'>('android');
  const [notifications, setNotifications] = useState<FlowNotification[]>(flowData.notifications as FlowNotification[]);
  const [ruleStats, setRuleStats] = useState({ impressions: 0, clicks: 0, revenueCents: 0 });
  const [ruleEnabled, setRuleEnabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [diagnosticsNonce, setDiagnosticsNonce] = useState(0);
  const deviceName = previewDevice.charAt(0).toUpperCase() + previewDevice.slice(1);

  const overviewUrl = shopDomain ? '/api/automations/overview?shop=' + encodeURIComponent(shopDomain) : '';
  const rulesUrl = shopDomain ? '/api/automations/rules?shop=' + encodeURIComponent(shopDomain) : '';
  const diagnosticsUrl = shopDomain
    ? '/api/automations/welcome-diagnostics?shop=' + encodeURIComponent(shopDomain) + '&r=' + String(diagnosticsNonce)
    : '';

  const { data: overviewPayload } = useCachedJson<{ ok?: boolean; rules?: Array<{ ruleKey: string; impressions?: number; clicks?: number; revenueCents?: number; enabled?: boolean }> }>({
    cacheKey: `welcome-overview:${shopDomain}`,
    url: overviewUrl,
    enabled: Boolean(shopDomain),
  });

  const { data: rulesPayload } = useCachedJson<{ ok?: boolean; rules?: Array<{ ruleKey: string; enabled?: boolean; config?: { steps?: Record<string, WelcomeRuleStepConfig> } }> }>({
    cacheKey: `welcome-rules:${shopDomain}`,
    url: rulesUrl,
    enabled: Boolean(shopDomain),
  });

  const { data: diagnosticsPayload } = useCachedJson<WelcomeDiagnosticsPayload>({
    cacheKey: `welcome-diagnostics:${shopDomain}:${diagnosticsNonce}`,
    url: diagnosticsUrl,
    enabled: Boolean(shopDomain),
    refreshMs: 15_000,
  });

  useEffect(() => {
    setQueryShop(new URLSearchParams(window.location.search).get('shop') || '');
  }, []);

  useEffect(() => {
    if (!overviewPayload?.ok) return;
    const rule = (overviewPayload.rules ?? []).find((r) => r.ruleKey === 'welcome_subscriber');
    if (!rule) return;
    setRuleStats({ impressions: rule.impressions ?? 0, clicks: rule.clicks ?? 0, revenueCents: rule.revenueCents ?? 0 });
  }, [overviewPayload]);

  useEffect(() => {
    if (!rulesPayload?.ok) return;
    const rule = (rulesPayload.rules ?? []).find((r) => r.ruleKey === 'welcome_subscriber');
    if (!rule) return;

    setRuleEnabled(Boolean(rule.enabled));

    const steps = rule.config?.steps;
    if (!steps) return;

    setNotifications((current) =>
      current.map((item) => {
        const step = steps[item.id] ?? {};
        return {
          ...item,
          delay: delayMinutesToLabel(Number(step.delayMinutes ?? delayLabelToMinutes(item.delay))),
          status: step.enabled ? 'Active' : 'Inactive',
          notification: {
            ...item.notification,
            title: step.title ?? item.notification.title,
            message: step.body ?? item.notification.message,
            iconUrl: step.iconUrl ?? item.notification.iconUrl,
            heroUrl: step.imageUrl ?? item.notification.heroUrl,
            windowsImageUrl: step.windowsImageUrl ?? item.notification.windowsImageUrl ?? item.notification.heroUrl,
            macosImageUrl: step.macosImageUrl ?? item.notification.macosImageUrl ?? item.notification.heroUrl,
            androidImageUrl: step.androidImageUrl ?? item.notification.androidImageUrl ?? item.notification.heroUrl,
            actionButtons: step.actionButtons ?? item.notification.actionButtons,
          },
        };
      }),
    );
  }, [rulesPayload]);

  useEffect(() => {
    if (!diagnosticsPayload?.ok) {
      return;
    }

    // Temporary console diagnostics for delayed reminder debugging.
    console.log('[welcome-diagnostics]', {
      shopDomain,
      checkedAt: diagnosticsPayload.checkedAt,
      reminder2: diagnosticsPayload.summary?.reminder2,
      reminder3: diagnosticsPayload.summary?.reminder3,
      staleProcessing: diagnosticsPayload.summary?.staleProcessing,
      issues: diagnosticsPayload.inferredIssues ?? [],
    });
  }, [diagnosticsPayload, shopDomain]);

  const saveWelcomeConfig = async (updatedNotifications: FlowNotification[]) => {
    if (!shopDomain) return;

    const config = { steps: buildStepsConfigFromNotifications(updatedNotifications) };
    const enabled = updatedNotifications.some((item) => item.status === 'Active');
    await fetch('/api/automations/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopDomain,
        ruleKey: 'welcome_subscriber',
        enabled,
        config,
      }),
    });
  };

  const diagnosticsReport = useMemo(() => {
    if (!diagnosticsPayload?.ok) {
      return 'Diagnostics unavailable. Check shop context and refresh this page.';
    }

    const reminder2 = diagnosticsPayload.summary?.reminder2;
    const reminder3 = diagnosticsPayload.summary?.reminder3;
    const issues = diagnosticsPayload.inferredIssues ?? [];
    const media = diagnosticsPayload.reminderMedia ?? {};
    const recentJobs = diagnosticsPayload.recentJobs ?? [];

    const recentText = recentJobs
      .slice(0, 12)
      .map((job) =>
        [
          `job=${job.id}`,
          `step=${job.stepKey}`,
          `status=${job.status}`,
          `attempts=${job.attempts}`,
          `dueAt=${job.dueAt ?? 'null'}`,
          `sentAt=${job.sentAt ?? 'null'}`,
          `updatedAt=${job.updatedAt ?? 'null'}`,
          `tokenStatus=${job.tokenStatus ?? 'null'}`,
          `error=${job.errorMessage ?? 'null'}`,
        ].join(' | '),
      )
      .join('\n');

    return [
      `shop=${diagnosticsPayload.shopDomain ?? shopDomain}`,
      `checkedAt=${diagnosticsPayload.checkedAt ?? 'n/a'}`,
      `processing claimed=${diagnosticsPayload.processing?.claimed ?? 0} sent=${diagnosticsPayload.processing?.sent ?? 0} failed=${diagnosticsPayload.processing?.failed ?? 0}`,
      `reminder-2 pending=${reminder2?.pending ?? 0} dueNow=${reminder2?.dueNow ?? 0} processing=${reminder2?.processing ?? 0} sent=${reminder2?.sent ?? 0} delivered=${reminder2?.delivered ?? 0} failed=${reminder2?.failed ?? 0} skipped=${reminder2?.skipped ?? 0} lastDeliveredAt=${reminder2?.lastDeliveredAt ?? 'null'}`,
      `reminder-3 pending=${reminder3?.pending ?? 0} dueNow=${reminder3?.dueNow ?? 0} processing=${reminder3?.processing ?? 0} sent=${reminder3?.sent ?? 0} delivered=${reminder3?.delivered ?? 0} failed=${reminder3?.failed ?? 0} skipped=${reminder3?.skipped ?? 0} lastDeliveredAt=${reminder3?.lastDeliveredAt ?? 'null'}`,
      `staleProcessing=${diagnosticsPayload.summary?.staleProcessing ?? 0}`,
      'configured media:',
      ...(['reminder-1', 'reminder-2', 'reminder-3'] as const).map((stepKey) => {
        const item = media[stepKey] ?? {};
        return [
          `${stepKey}.icon present=${item.icon?.present ? 'yes' : 'no'} scheme=${item.icon?.scheme ?? 'none'} normalized=${item.icon?.normalized ?? 'null'}`,
          `${stepKey}.image present=${item.image?.present ? 'yes' : 'no'} scheme=${item.image?.scheme ?? 'none'} normalized=${item.image?.normalized ?? 'null'}`,
          `${stepKey}.windowsImage present=${item.windowsImage?.present ? 'yes' : 'no'} scheme=${item.windowsImage?.scheme ?? 'none'} normalized=${item.windowsImage?.normalized ?? 'null'}`,
          `${stepKey}.macosImage present=${item.macosImage?.present ? 'yes' : 'no'} scheme=${item.macosImage?.scheme ?? 'none'} normalized=${item.macosImage?.normalized ?? 'null'}`,
          `${stepKey}.androidImage present=${item.androidImage?.present ? 'yes' : 'no'} scheme=${item.androidImage?.scheme ?? 'none'} normalized=${item.androidImage?.normalized ?? 'null'}`,
        ].join(' | ');
      }),
      'issues:',
      ...(issues.length > 0 ? issues.map((issue, index) => `${index + 1}. ${issue}`) : ['1. no inferred issues']),
      'recent jobs:',
      recentText || 'none',
    ].join('\n');
  }, [diagnosticsPayload, shopDomain]);

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsReport);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // no-op
    }
  };

  const clearOldResults = async () => {
    if (!shopDomain || clearing) {
      return;
    }

    setClearing(true);
    try {
      await fetch('/api/automations/welcome-diagnostics?shop=' + encodeURIComponent(shopDomain), {
        method: 'POST',
      });
      setDiagnosticsNonce((value) => value + 1);
    } catch {
      // no-op
    } finally {
      setClearing(false);
    }
  };

  const handleStatusChange = async (id: string, checked: boolean) => {
    const updatedNotifications: FlowNotification[] = notifications.map((item) =>
      item.id === id ? { ...item, status: (checked ? 'Active' : 'Inactive') as 'Active' | 'Inactive' } : item,
    );
    setNotifications(updatedNotifications);

    try {
      await saveWelcomeConfig(updatedNotifications);
    } catch {
      // no-op
    }
  };

  const handleDelayChange = async (id: string, delayLabel: string) => {
    const updatedNotifications = notifications.map((item) =>
      item.id === id ? { ...item, delay: delayLabel } : item,
    );
    setNotifications(updatedNotifications);

    try {
      await saveWelcomeConfig(updatedNotifications);
    } catch {
      // no-op
    }
  };

  return (
    <div className="flex flex-col bg-muted/40 min-h-screen">
      <div className="p-4 sm:p-6 md:p-8 flex flex-col">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/automations">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to Automations</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{flowData.title}</h1>
          </div>
        </div>

        <div className="mb-4">
          <FlowStats stats={{ inQueue: 0, impressions: ruleStats.impressions, clicks: ruleStats.clicks }} />
        </div>

        <div className="mb-6 rounded-md border bg-background p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Temporary Welcome Diagnostics (step-2/step-3)</h2>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={clearOldResults} disabled={clearing || !shopDomain}>
                {clearing ? 'Clearing...' : 'Clear old results'}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={copyDiagnostics}>
                {copied ? 'Copied' : 'Copy full issue'}
              </Button>
            </div>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            This report is temporary for debugging delayed reminders. Copy and share it when reminder-2/reminder-3 do not send.
          </p>
          <pre className="max-h-80 overflow-auto rounded border bg-muted p-3 text-xs whitespace-pre-wrap">{diagnosticsReport}</pre>
        </div>

        <div className="mb-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <TabletSmartphone className="mr-2 h-4 w-4" />
                <span>Preview on: {deviceName}</span>
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Select Device</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={previewDevice} onValueChange={(value) => setPreviewDevice(value as 'windows' | 'macos' | 'android' | 'ios')}>
                <DropdownMenuRadioItem value="android">Android</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="windows">Windows</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="macos">macOS</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="ios">iOS</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="max-w-md mx-auto w-full flex flex-col items-center">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-2 text-sm font-semibold tracking-wide uppercase text-muted-foreground">Trigger</h3>
            <p className="mt-1 font-medium">{flowData.trigger}</p>
          </div>
          <div className="my-4 h-8 border-l-2 border-dashed border-gray-600" />
          <div className="w-full flex flex-col items-center">
            {notifications.map((step, index) => (
              <Fragment key={step.id}>
                <div className="w-full">
                  <FlowNotificationCard
                    step={step}
                    previewDevice={previewDevice}
                    onStatusChange={handleStatusChange}
                    onDelayChange={handleDelayChange}
                    automationName="welcome-notifications"
                    shopDomain={shopDomain}
                  />
                </div>
                {index < notifications.length - 1 && <div className="my-4 h-8 border-l-2 border-dashed border-gray-600" />}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
