
'use client';

import React, { useState, Fragment, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FlowNotificationCard, type NotificationStep } from '@/components/automations/flow-notification-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { formatCurrency } from '@/lib/utils';
import { useSettings } from '@/context/settings-context';


const flowData = {
    title: "Abandoned Cart Recovery",
    topStats: {
        impressions: 0,
        clicks: 0,
        cartsRecovered: 0,
        revenue: formatCurrency(0)
    },
    trigger: "When a subscriber adds a product to the cart",
    notifications: [
        {
            id: 'cart-reminder-1',
            title: "Reminder 1",
            delay: "20 minutes",
            status: 'Active',
            notification: {
                title: "You left something behind!",
                message: "We've saved your cart for you. Buy them now before they go out of stock!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null,
                siteName: "push-eagle-test1.myshopify.com",
                actionButtons: [{title: 'Checkout', link: '#'}, {title: 'Continue Shopping', link: '#'}]
            },
            stats: {
                revenue: formatCurrency(0),
                cartsRecovered: 0,
                clicks: 0,
                ctr: '0%',
                impressions: 0,
            }
        },
        {
            id: 'cart-reminder-2',
            title: "Reminder 2",
            delay: "2 hours",
            status: 'Active',
            notification: {
                title: "Still thinking it over?",
                message: "Your cart is waiting for you. Complete your purchase now and get free shipping on all orders!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null,
                siteName: "push-eagle-test1.myshopify.com",
                actionButtons: [{title: 'View Cart', link: '#'}]
            },
             stats: {
                revenue: formatCurrency(0),
                cartsRecovered: 0,
                clicks: 0,
                ctr: '0%',
                impressions: 0,
            }
        },
        {
            id: 'cart-reminder-3',
            title: "Reminder 3",
            delay: "1 day",
            status: 'Inactive',
            notification: {
                title: "Don't miss out!",
                message: "The items in your cart are popular and might sell out soon. Grab them before they're gone!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null,
                siteName: "push-eagle-test1.myshopify.com",
                actionButtons: [
                    {title: 'Complete Purchase', link: '#'}
                ]
            },
             stats: {
                revenue: formatCurrency(0),
                cartsRecovered: 0,
                clicks: 0,
                ctr: '0%',
                impressions: 0,
            }
        },
    ]
}

const ReminderStats = ({ stats }: { stats: typeof flowData.notifications[0]['stats'] }) => (
    <Card className="w-full mt-2">
        <CardContent className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <p className="text-xs text-muted-foreground">Total revenue</p>
                    <p className="font-bold">{stats.revenue}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-muted-foreground">Carts recovered</p>
                    <p className="font-bold">{stats.cartsRecovered}</p>
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


export default function AbandonedCartPage() {
    type FlowNotification = typeof flowData.notifications[number] & { status: 'Active' | 'Inactive' };
    const { shopDomain: settingsShop } = useSettings();
    const [queryShop, setQueryShop] = useState('');
    const shopDomain = queryShop || settingsShop || '';

    const [previewDevice, setPreviewDevice] = useState<'windows' | 'macos' | 'android' | 'ios'>('android');
    const [notifications, setNotifications] = useState<FlowNotification[]>(flowData.notifications as FlowNotification[]);
    const [showReminderStats, setShowReminderStats] = useState(true);
    const [ruleStats, setRuleStats] = useState({ impressions: 0, clicks: 0, revenueCents: 0 });
    const [ruleEnabled, setRuleEnabled] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setQueryShop(new URLSearchParams(window.location.search).get('shop') || '');
    }, []);

    useEffect(() => {
        if (!shopDomain) return;
        fetch(`/api/automations/overview?shop=${encodeURIComponent(shopDomain)}`)
            .then(res => res.json())
            .then(payload => {
                if (!payload?.ok) return;
                const rule = (payload.rules ?? []).find((r: { ruleKey: string }) => r.ruleKey === 'cart_abandonment_30m');
                if (rule) {
                    setRuleStats({ impressions: rule.impressions ?? 0, clicks: rule.clicks ?? 0, revenueCents: rule.revenueCents ?? 0 });
                    setRuleEnabled(rule.enabled ?? false);
                }
            })
            .catch(() => undefined);
    }, [shopDomain]);

    const handleToggleFlow = async () => {
        if (!shopDomain) return;
        setSaving(true);
        const newEnabled = !ruleEnabled;
        await fetch('/api/automations/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shopDomain, ruleKey: 'cart_abandonment_30m', enabled: newEnabled, config: {} }),
        }).catch(() => undefined);
        setRuleEnabled(newEnabled);
        setSaving(false);
    };

    const handleStatusChange = async (id: string, checked: boolean) => {
        setNotifications(currentNotifications =>
            currentNotifications.map(n =>
                n.id === id ? { ...n, status: checked ? 'Active' : 'Inactive' } : n
            )
        );
        if (!shopDomain) return;
        const updatedNotifications = notifications.map(n =>
            n.id === id ? { ...n, status: checked ? 'Active' : 'Inactive' } : n
        );
        const stepsConfig = Object.fromEntries(updatedNotifications.map(n => [n.id, { enabled: n.status === 'Active' }]));
        await fetch('/api/automations/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shopDomain, ruleKey: 'cart_abandonment_30m', config: { steps: stepsConfig } }),
        }).catch(() => undefined);
    };

    const isFlowActive = ruleEnabled;

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
                
                <div className="flex items-center justify-between">
                    <div/>
                    <Button onClick={handleToggleFlow} disabled={saving} variant={ruleEnabled ? 'outline' : 'default'}>
                        {saving ? 'Saving...' : ruleEnabled ? 'Deactivate Flow' : 'Activate Flow'}
                    </Button>
                </div>
                <Card>
                    <CardContent className="p-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x">
                            <div className="p-4 text-center">
                                <p className="text-sm text-muted-foreground">Impressions</p>
                                <p className="text-2xl font-bold">{ruleStats.impressions.toLocaleString()}</p>
                            </div>
                            <div className="p-4 text-center">
                                <p className="text-sm text-muted-foreground">Clicks</p>
                                <p className="text-2xl font-bold">{ruleStats.clicks.toLocaleString()}</p>
                            </div>
                            <div className="p-4 text-center">
                                <p className="text-sm text-muted-foreground">Carts recovered</p>
                                <p className="text-2xl font-bold">0</p>
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
                                <Select value={previewDevice} onValueChange={(value) => setPreviewDevice(value as any)}>
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
                                        Activate a reminder to start sending these notifications to new subscribers.
                                    </AlertDescription>
                                </Alert>
                            )}

                            {/* Trigger */}
                            <div className="text-center">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                                    <Zap className="h-6 w-6 text-primary" />
                                </div>
                                <h3 className="mt-2 text-sm font-semibold tracking-wide uppercase text-muted-foreground">Trigger</h3>
                                <p className="mt-1 font-medium">{flowData.trigger}</p>
                            </div>

                            {/* Connector */}
                            <div className="my-4 h-8 border-l-2 border-dashed border-gray-600" />

                            {/* Notifications */}
                            <div className="w-full flex flex-col items-center">
                                {notifications.map((step, index) => (
                                    <Fragment key={step.id}>
                                        <div className="w-full">
                                            <FlowNotificationCard 
                                                step={step} 
                                                previewDevice={previewDevice}
                                                onStatusChange={handleStatusChange}
                                                automationName="abandoned-cart-recovery"
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
