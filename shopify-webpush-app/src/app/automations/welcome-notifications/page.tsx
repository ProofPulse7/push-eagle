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
import { useCachedJson } from '@/hooks/use-cached-json';
import { useSettings } from '@/context/settings-context';

type NotificationPreviewData = {
  title: string;
  message: string;
  targetUrl?: string;
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
  targetUrl?: string | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
  windowsImageUrl?: string | null;
  macosImageUrl?: string | null;
  androidImageUrl?: string | null;
  actionButtons?: Array<{ title: string; link: string }>;
};

const delayLabelToMinutes = (label: string) => {
  const normalized = label.trim().toLowerCase();
  if (normalized.endsWith('day') || normalized.endsWith('days')) {
    const amount = Number.parseInt(normalized, 10);
    return Number.isFinite(amount) ? amount * 24 * 60 : 0;
  }
  const amount = Number.parseInt(normalized, 10);
  return Number.isFinite(amount) ? amount : 0;
};

const delayMinutesToLabel = (minutes: number) => {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  if (safeMinutes > 0 && safeMinutes % (24 * 60) === 0) {
    const days = safeMinutes / (24 * 60);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${safeMinutes} minute${safeMinutes === 1 ? '' : 's'}`;
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
        targetUrl: notification.notification.targetUrl ?? null,
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
  const deviceName = previewDevice.charAt(0).toUpperCase() + previewDevice.slice(1);

  const overviewUrl = shopDomain ? '/api/automations/overview?shop=' + encodeURIComponent(shopDomain) : '';
  const rulesUrl = shopDomain ? '/api/automations/rules?shop=' + encodeURIComponent(shopDomain) : '';

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
            targetUrl: step.targetUrl ?? item.notification.targetUrl,
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
