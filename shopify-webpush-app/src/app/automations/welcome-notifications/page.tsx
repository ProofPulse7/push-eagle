'use client';

import React, { Fragment, useEffect, useState } from 'react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useSettings } from '@/context/settings-context';

type NotificationPreviewData = {
  title: string;
  message: string;
  iconUrl: string;
  heroUrl: string | null;
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
      delay: '2 hours',
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
  actionButtons?: Array<{ title: string; link: string }>;
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
  const deviceName = previewDevice.charAt(0).toUpperCase() + previewDevice.slice(1);

  useEffect(() => {
    setQueryShop(new URLSearchParams(window.location.search).get('shop') || '');
  }, []);

  useEffect(() => {
    if (!shopDomain) return;

    fetch('/api/automations/overview?shop=' + encodeURIComponent(shopDomain))
      .then((res) => res.json())
      .then((payload) => {
        if (!payload?.ok) return;
        const rule = (payload.rules ?? []).find((r: { ruleKey: string }) => r.ruleKey === 'welcome_subscriber');
        if (rule) {
          setRuleStats({ impressions: rule.impressions ?? 0, clicks: rule.clicks ?? 0, revenueCents: rule.revenueCents ?? 0 });
        }
      })
      .catch(() => undefined);

    fetch('/api/automations/rules?shop=' + encodeURIComponent(shopDomain))
      .then((res) => res.json())
      .then((payload) => {
        if (!payload?.ok) return;
        const rule = (payload.rules ?? []).find((r: { ruleKey: string }) => r.ruleKey === 'welcome_subscriber');
        if (!rule?.config?.steps) return;

        const steps = rule.config.steps as Record<string, WelcomeRuleStepConfig>;

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
                actionButtons: step.actionButtons ?? item.notification.actionButtons,
              },
            };
          }),
        );
      })
      .catch(() => undefined);
  }, [shopDomain]);

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

  const isFlowActive = notifications.some((item) => item.status === 'Active');

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
          {!isFlowActive && (
            <Alert className="w-full mb-8">
              <AlertTitle>This automation is inactive</AlertTitle>
              <AlertDescription>Enable at least one reminder to start sending these notifications to new subscribers.</AlertDescription>
            </Alert>
          )}
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
