'use client';

import React, { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap } from 'lucide-react';

import { FlowNotificationCard } from '@/components/automations/flow-notification-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSettings } from '@/context/settings-context';
import { formatCurrency } from '@/lib/utils';

type BrowseRuleStepConfig = {
  enabled?: boolean;
  delayMinutes?: number;
  title?: string;
  body?: string;
  iconUrl?: string | null;
  imageUrl?: string | null;
  actionButtons?: Array<{ title: string; link: string }>;
  targetUrl?: string | null;
};

type FlowNotification = {
  id: 'browse-reminder-1' | 'browse-reminder-2' | 'browse-reminder-3';
  title: string;
  delay: string;
  status: 'Active' | 'Inactive';
  notification: {
    title: string;
    message: string;
    iconUrl: string;
    heroUrl: string | null;
    siteName: string;
    actionButtons: Array<{ title: string; link: string }>;
  };
  stats: {
    revenue: string;
    ordersPlaced: number;
    clicks: number;
    ctr: string;
    impressions: number;
  };
};

const flowData: {
  title: string;
  trigger: string;
  notifications: FlowNotification[];
} = {
  title: 'Browse Abandonment',
  trigger: 'When a visitor views a product but does not add to cart',
  notifications: [
    {
      id: 'browse-reminder-1',
      title: 'Reminder 1',
      delay: '20 minutes',
      status: 'Active',
      notification: {
        title: 'Still interested in this?',
        message: 'We noticed you viewed this product. Take another look before it sells out.',
        iconUrl: 'https://placehold.co/48x48.png',
        heroUrl: null,
        siteName: 'push-eagle-test1.myshopify.com',
        actionButtons: [{ title: 'View Product', link: '/products' }],
      },
      stats: {
        revenue: formatCurrency(0),
        ordersPlaced: 0,
        clicks: 0,
        ctr: '0%',
        impressions: 0,
      },
    },
    {
      id: 'browse-reminder-2',
      title: 'Reminder 2',
      delay: '2 hours',
      status: 'Inactive',
      notification: {
        title: 'A special offer for you',
        message: "Here is 10% off the products you viewed. Don't miss out!",
        iconUrl: 'https://placehold.co/48x48.png',
        heroUrl: null,
        siteName: 'push-eagle-test1.myshopify.com',
        actionButtons: [{ title: 'Shop Now', link: '/collections/all' }],
      },
      stats: {
        revenue: formatCurrency(0),
        ordersPlaced: 0,
        clicks: 0,
        ctr: '0%',
        impressions: 0,
      },
    },
    {
      id: 'browse-reminder-3',
      title: 'Reminder 3',
      delay: '1 day',
      status: 'Inactive',
      notification: {
        title: "Don't let it get away!",
        message: 'The product you viewed is getting a lot of attention. Secure yours before it is gone.',
        iconUrl: 'https://placehold.co/48x48.png',
        heroUrl: null,
        siteName: 'push-eagle-test1.myshopify.com',
        actionButtons: [{ title: 'View Product', link: '/products' }],
      },
      stats: {
        revenue: formatCurrency(0),
        ordersPlaced: 0,
        clicks: 0,
        ctr: '0%',
        impressions: 0,
      },
    },
  ],
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
        targetUrl: null,
      },
    ]),
  );
};

const ReminderStats = ({ stats }: { stats: FlowNotification['stats'] }) => (
  <Card className="w-full mt-2">
    <CardContent className="p-3 space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Total revenue</p>
          <p className="font-bold">{stats.revenue}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Orders placed</p>
          <p className="font-bold">{stats.ordersPlaced}</p>
        </div>
      </div>
      <Separator />
      <div className="grid grid-cols-3 text-center text-xs gap-2">
        <div>
          <p className="text-muted-foreground">Clicks</p>
          <p className="font-medium">{stats.clicks}</p>
        </div>
        <div>
          <p className="text-muted-foreground">CTR</p>
          <p className="font-medium">{stats.ctr}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Impressions</p>
          <p className="font-medium">{stats.impressions}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function BrowseAbandonmentPage() {
  const { shopDomain: settingsShop } = useSettings();
  const [queryShop, setQueryShop] = useState('');
  const shopDomain = queryShop || settingsShop || '';

  const [previewDevice, setPreviewDevice] = useState<'windows' | 'macos' | 'android' | 'ios'>('android');
  const [notifications, setNotifications] = useState<FlowNotification[]>(flowData.notifications as FlowNotification[]);
  const [showReminderStats, setShowReminderStats] = useState(true);
  const [ruleStats, setRuleStats] = useState({ impressions: 0, clicks: 0, revenueCents: 0 });

  useEffect(() => {
    setQueryShop(new URLSearchParams(window.location.search).get('shop') || '');
  }, []);

  useEffect(() => {
    if (!shopDomain) return;

    fetch('/api/automations/overview?shop=' + encodeURIComponent(shopDomain))
      .then((res) => res.json())
      .then((payload) => {
        if (!payload?.ok) return;
        const rule = (payload.rules ?? []).find((r: { ruleKey: string }) => r.ruleKey === 'browse_abandonment_15m');
        if (rule) {
          setRuleStats({ impressions: rule.impressions ?? 0, clicks: rule.clicks ?? 0, revenueCents: rule.revenueCents ?? 0 });
        }
      })
      .catch(() => undefined);

    fetch('/api/automations/rules?shop=' + encodeURIComponent(shopDomain))
      .then((res) => res.json())
      .then((payload) => {
        if (!payload?.ok) return;
        const rule = (payload.rules ?? []).find((r: { ruleKey: string }) => r.ruleKey === 'browse_abandonment_15m');
        if (!rule?.config?.steps) return;

        const steps = rule.config.steps as Record<string, BrowseRuleStepConfig>;
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

  const saveBrowseConfig = async (updatedNotifications: FlowNotification[]) => {
    if (!shopDomain) return;

    const enabled = updatedNotifications.some((item) => item.status === 'Active');

    await fetch('/api/automations/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopDomain,
        ruleKey: 'browse_abandonment_15m',
        enabled,
        config: { steps: buildStepsConfigFromNotifications(updatedNotifications) },
      }),
    });
  };

  const handleStatusChange = async (id: string, checked: boolean) => {
    const updatedNotifications = notifications.map((item) =>
      item.id === id ? { ...item, status: (checked ? 'Active' : 'Inactive') as 'Active' | 'Inactive' } : item,
    );
    setNotifications(updatedNotifications);

    try {
      await saveBrowseConfig(updatedNotifications);
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
      await saveBrowseConfig(updatedNotifications);
    } catch {
      // no-op
    }
  };

  const isFlowActive = notifications.some((item) => item.status === 'Active');

  return (
    <div className="flex flex-col bg-muted/40 min-h-screen">
      <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
        <div className="flex items-center gap-4">
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

        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x">
              <div className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Impressions</p>
                <p className="text-2xl font-bold">{(ruleStats?.impressions ?? 0).toLocaleString()}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Clicks</p>
                <p className="text-2xl font-bold">{(ruleStats?.clicks ?? 0).toLocaleString()}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-sm text-muted-foreground">Revenue generated</p>
                <p className="text-2xl font-bold">{formatCurrency(ruleStats.revenueCents / 100)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="flow">
          <div className="flex justify-between items-center">
            <TabsList>
              <TabsTrigger value="flow">Flow</TabsTrigger>
              <TabsTrigger value="order-data">Order data</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="show-analytics" className="text-xs">Show Analytics</Label>
                <div className="transform scale-75">
                  <Switch
                    id="show-analytics"
                    checked={showReminderStats}
                    onCheckedChange={setShowReminderStats}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="preview-device" className="text-xs">Notification preview</Label>
                <Select value={previewDevice} onValueChange={(value) => setPreviewDevice(value as 'windows' | 'macos' | 'android' | 'ios')}>
                  <SelectTrigger id="preview-device" className="w-[110px] h-9 bg-background text-xs">
                    <SelectValue placeholder="Select device" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="android">Android</SelectItem>
                    <SelectItem value="windows">Windows</SelectItem>
                    <SelectItem value="macos">macOS</SelectItem>
                    <SelectItem value="ios">iOS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <TabsContent value="flow" className="mt-6">
            <div className="max-w-md mx-auto w-full flex flex-col items-center">
              {!isFlowActive && (
                <Alert className="w-full mb-8">
                  <AlertTitle>This automation is inactive</AlertTitle>
                  <AlertDescription>
                    Enable at least one reminder to start sending these notifications.
                  </AlertDescription>
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
                        automationName="browse-abandonment"
                        shopDomain={shopDomain}
                      />
                      {showReminderStats && <ReminderStats stats={step.stats} />}
                    </div>
                    {index < notifications.length - 1 && (
                      <div className="my-4 h-8 border-l-2 border-dashed border-gray-600" />
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="order-data">
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground">Order data will be shown here.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
