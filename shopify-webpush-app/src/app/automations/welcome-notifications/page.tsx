'use client';

import React, { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, TabletSmartphone, Zap } from 'lucide-react';

import { AutomationFlowStepsSkeleton } from '@/components/automations/automation-flow-steps-skeleton';
import { AutomationRuleStatusBadge, AutomationRuleToggleButton } from '@/components/automations/automation-rule-toggle';
import { FlowNotificationCard } from '@/components/automations/flow-notification-card';
import { FlowStats } from '@/components/automations/flow-stats';
import { Button } from '@/components/ui/button';
import {
  createDebouncedAutomationStepsSaver,
} from '@/lib/client/automation-flow-steps';
import { resolveAutomationRuleEnabled, useAutomationRuleToggle } from '@/hooks/use-automation-rule-toggle';
import { useAutomationFlowRules } from '@/hooks/use-automation-flow-rules';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSettings } from '@/context/settings-context';
import { mergeFlowNotificationsFromSteps } from '@/lib/client/automation-flow-notification-merge';
import { useMerchantDisplaySiteName } from '@/hooks/use-merchant-display-site';

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
        iconUrl: '',
        heroUrl: null,
        siteName: 'Your store',
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
        iconUrl: '',
        heroUrl: null,
        siteName: 'Your store',
        actionButtons: [{ title: 'Shop Now', link: '/collections/all' }],
      },
    },
    {
      id: 'reminder-3',
      title: 'Reminder 3',
      delay: '1 day',
      status: 'Inactive',
      notification: {
        title: 'Hey there! Anything specific caught your eye?',
        message: 'Our products are made with care, giving you the best!',
        iconUrl: '',
        heroUrl: null,
        siteName: 'Your store',
        actionButtons: [
          { title: 'View Products', link: '/collections/all' },
          { title: 'Special Offers', link: '/collections/all' },
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
  const queryClient = useQueryClient();
  const { shopDomain: settingsShop } = useSettings();
  const displaySiteName = useMerchantDisplaySiteName();
  const { toggleRuleEnabled, toggleError, atLimit } = useAutomationRuleToggle('welcome_subscriber');
  const [queryShop, setQueryShop] = useState('');
  const shopDomain = queryShop || settingsShop || '';

  const [previewDevice, setPreviewDevice] = useState<'windows' | 'macos' | 'android' | 'ios'>('android');
  const [notifications, setNotifications] = useState<FlowNotification[] | null>(null);
  const [ruleStats, setRuleStats] = useState({ impressions: 0, clicks: 0, revenueCents: 0 });
  const [ruleEnabled, setRuleEnabled] = useState(false);
  const deviceName = previewDevice.charAt(0).toUpperCase() + previewDevice.slice(1);

  const {
    rule,
    overviewPayload,
    flowConfigReady,
    flowConfigLoading,
  } = useAutomationFlowRules({
    shopDomain,
    ruleKey: 'welcome_subscriber',
    rulesCacheKey: `welcome-rules:${shopDomain}`,
    overviewCacheKey: `welcome-overview:${shopDomain}`,
  });

  const resolvedNotifications = useMemo(() => {
    if (!flowConfigReady || !shopDomain) {
      return null;
    }

    const merged = mergeFlowNotificationsFromSteps(
      flowData.notifications as FlowNotification[],
      rule?.config?.steps as Record<string, WelcomeRuleStepConfig> | undefined,
      shopDomain,
      'welcome_subscriber',
      delayMinutesToLabel,
      delayLabelToMinutes,
    );

    if (displaySiteName === 'Your store') {
      return merged;
    }

    return merged.map((item) => ({
      ...item,
      notification: {
        ...item.notification,
        siteName: displaySiteName,
      },
    }));
  }, [displaySiteName, flowConfigReady, rule, shopDomain]);

  useEffect(() => {
    setQueryShop(new URLSearchParams(window.location.search).get('shop') || '');
  }, []);

  const displayNotifications = notifications ?? resolvedNotifications;

  useEffect(() => {
    if (!resolvedNotifications) {
      return;
    }

    setNotifications(resolvedNotifications);
  }, [resolvedNotifications]);

  useEffect(() => {
    if (!overviewPayload?.ok) return;
    const overviewRule = (overviewPayload.rules ?? []).find((r) => r.ruleKey === 'welcome_subscriber');
    if (!overviewRule) return;
    setRuleStats({
      impressions: overviewRule.impressions ?? 0,
      clicks: overviewRule.clicks ?? 0,
      revenueCents: overviewRule.revenueCents ?? 0,
    });
  }, [overviewPayload]);

  useEffect(() => {
    if (!shopDomain) return;
    setRuleEnabled(
      resolveAutomationRuleEnabled(
        shopDomain,
        'welcome_subscriber',
        queryClient,
        rule?.enabled,
      ),
    );
  }, [queryClient, rule?.enabled, shopDomain]);

  const saveWelcomeConfig = useMemo(
    () =>
      createDebouncedAutomationStepsSaver(
        shopDomain,
        'welcome_subscriber',
        buildStepsConfigFromNotifications,
      ),
    [shopDomain],
  );

  const handleStatusChange = (id: string, checked: boolean) => {
    const base = notifications ?? resolvedNotifications;
    if (!base) return;
    const updatedNotifications: FlowNotification[] = base.map((item) =>
      item.id === id ? { ...item, status: (checked ? 'Active' : 'Inactive') as 'Active' | 'Inactive' } : item,
    );
    setNotifications(updatedNotifications);
    saveWelcomeConfig(updatedNotifications);
  };

  const handleDelayChange = (id: string, delayLabel: string) => {
    const base = notifications ?? resolvedNotifications;
    if (!base) return;
    const updatedNotifications = base.map((item) =>
      item.id === id ? { ...item, delay: delayLabel } : item,
    );
    setNotifications(updatedNotifications);
    saveWelcomeConfig(updatedNotifications);
  };

  const handleRuleToggle = () => {
    setRuleEnabled(toggleRuleEnabled(ruleEnabled));
  };

  return (
    <div className="flex flex-col bg-muted/40 min-h-screen">
      <div className="p-4 sm:p-6 md:p-8 flex flex-col">
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/automations">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back to Automations</span>
            </Link>
          </Button>
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{flowData.title}</h1>
            <AutomationRuleStatusBadge enabled={ruleEnabled} />
          </div>
          <AutomationRuleToggleButton
            enabled={ruleEnabled}
            onToggle={handleRuleToggle}
            disabled={!ruleEnabled && atLimit}
            disabledTitle={!ruleEnabled && atLimit ? 'Monthly impression limit reached.' : undefined}
          />
        </div>

        {toggleError ? <p className="mb-4 text-sm text-destructive">{toggleError}</p> : null}

        {!ruleEnabled ? (
          <p className="mb-4 text-sm text-muted-foreground">
            This automation is inactive. Activate it to start sending welcome notifications.
          </p>
        ) : null}

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
            {flowConfigLoading || !displayNotifications ? (
              <AutomationFlowStepsSkeleton count={flowData.notifications.length} />
            ) : (
              displayNotifications.map((step, index) => (
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
                  {index < displayNotifications.length - 1 && (
                    <div className="my-4 h-8 border-l-2 border-dashed border-gray-600" />
                  )}
                </Fragment>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
