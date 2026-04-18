'use client';

import React, { useState, Fragment, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap, TabletSmartphone, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FlowStats } from '@/components/automations/flow-stats';
import { FlowNotificationCard } from '@/components/automations/flow-notification-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

const flowData = {
    title: "Welcome notifications",
    trigger: "When a new visitor subscribes",
    notifications: [
        {
            id: 'reminder-1',
            title: "Reminder 1",
            delay: "0 minutes",
            status: 'Inactive',
            notification: {
                title: "You are subscribed",
                message: "We will keep you posted with latest updates.",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null,
                siteName: "chrome.zahoorshop.com",
                actionButtons: []
            }
        },
        {
            id: 'reminder-2',
            title: "Reminder 2",
            delay: "2 hours",
            status: 'Inactive',
            notification: {
                title: "We're glad to have you here!",
                message: "As an exclusive subscriber, you'll get our latest offers and products before anyone else!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: "https://placehold.co/728x360.png",
                siteName: "chrome.zahoorshop.com",
                actionButtons: [{title: 'Shop Now', link: 'https://example.com/shop'}]
            }
        },
        {
            id: 'reminder-3',
            title: "Reminder 3",
            delay: "1 day",
            status: 'Active',
            notification: {
                title: "Hey there! Anything specific caught your eye?",
                message: "Our products are made with care, giving you the best!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: "https://placehold.co/728x360.png",
                siteName: "chrome.zahoorshop.com",
                actionButtons: [
                    {title: 'View Products', link: 'https://example.com/products'},
                    {title: 'Special Offers', link: 'https://example.com/offers'}
                ]
            }
        },
    ]
}

export default function WelcomeNotificationsPage() {
    type FlowNotification = typeof flowData.notifications[number] & { status: 'Active' | 'Inactive' };
    const { shopDomain: settingsShop } = useSettings();
    const [queryShop, setQueryShop] = useState('');
    const shopDomain = queryShop || settingsShop || '';

    const [previewDevice, setPreviewDevice] = useState<'windows' | 'macos' | 'android' | 'ios'>('android');
    const [notifications, setNotifications] = useState<FlowNotification[]>(flowData.notifications as FlowNotification[]);
    const [ruleStats, setRuleStats] = useState({ impressions: 0, clicks: 0, revenueCents: 0 });
    const [ruleEnabled, setRuleEnabled] = useState(false);
    const [saving, setSaving] = useState(false);
    const deviceName = previewDevice.charAt(0).toUpperCase() + previewDevice.slice(1);

    useEffect(() => {
        setQueryShop(new URLSearchParams(window.location.search).get('shop') || '');
    }, []);

    useEffect(() => {
        if (!shopDomain) return;
        fetch('/api/automations/overview?shop=' + encodeURIComponent(shopDomain))
            .then(res => res.json())
            .then(payload => {
                if (!payload?.ok) return;
                const rule = (payload.rules ?? []).find((r: { ruleKey: string }) => r.ruleKey === 'welcome_subscriber');
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
            body: JSON.stringify({ shopDomain, ruleKey: 'welcome_subscriber', enabled: newEnabled, config: {} }),
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
            body: JSON.stringify({ shopDomain, ruleKey: 'welcome_subscriber', config: { steps: stepsConfig } }),
        }).catch(() => undefined);
    };

    const isFlowActive = ruleEnabled;

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

                <div className="flex items-center justify-end mb-4">
                    <Button onClick={handleToggleFlow} disabled={saving} variant={ruleEnabled ? 'outline' : 'default'}>
                        {saving ? 'Saving...' : ruleEnabled ? 'Deactivate Flow' : 'Activate Flow'}
                    </Button>
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
                            <AlertDescription>
                                Activate a reminder to start sending these notifications to new subscribers.
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
                                        automationName="welcome-notifications"
                                    />
                                </div>
                                {index < notifications.length - 1 && (
                                    <div className="my-4 h-8 border-l-2 border-dashed border-gray-600" />
                                )}
                            </Fragment>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
