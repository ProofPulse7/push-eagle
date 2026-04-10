
'use client';

import React, { useState, Fragment } from 'react';
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


const flowData = {
    title: "Browse Abandonment",
    topStats: {
        impressions: 4210,
        clicks: 198,
        revenue: formatCurrency(0)
    },
    trigger: "When a visitor views a product but does not add to cart",
    notifications: [
        {
            id: 'browse-reminder-1',
            title: "Reminder 1",
            delay: "20 minutes",
            status: 'Active',
            notification: {
                title: "Still interested in this?",
                message: "We noticed you were looking at some of our products. Take another look!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: "https://placehold.co/728x360.png",
                siteName: "chrome.zahoorshop.com",
                actionButtons: [{title: 'View Product', link: '#'}]
            },
            stats: {
                revenue: formatCurrency(0),
                ordersPlaced: 0,
                clicks: 0,
                ctr: '0%',
                impressions: 0,
            }
        },
        {
            id: 'browse-reminder-2',
            title: "Reminder 2",
            delay: "2 hours",
            status: 'Inactive',
            notification: {
                title: "A special offer for you",
                message: "Here's 10% off the products you viewed. Don't miss out!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null,
                siteName: "chrome.zahoorshop.com",
                actionButtons: [{title: 'Shop Now', link: '#'}]
            },
            stats: {
                revenue: formatCurrency(0),
                ordersPlaced: 0,
                clicks: 0,
                ctr: '0%',
                impressions: 0,
            }
        },
        {
            id: 'browse-reminder-3',
            title: "Reminder 3",
            delay: "1 day",
            status: 'Inactive',
            notification: {
                title: "Don't let it get away!",
                message: "The product you viewed is getting a lot of attention. Secure yours before it's gone.",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: "https://placehold.co/728x360.png",
                siteName: "chrome.zahoorshop.com",
                actionButtons: [{title: 'View Product', link: '#'}]
            },
            stats: {
                revenue: formatCurrency(0),
                ordersPlaced: 0,
                clicks: 0,
                ctr: '0%',
                impressions: 0,
            }
        }
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
    type FlowNotification = typeof flowData.notifications[number] & { status: 'Active' | 'Inactive' };
    const [previewDevice, setPreviewDevice] = useState<'windows' | 'macos' | 'android' | 'ios'>('android');
    const [notifications, setNotifications] = useState<FlowNotification[]>(flowData.notifications as FlowNotification[]);
    const [showReminderStats, setShowReminderStats] = useState(true);

    const handleStatusChange = (id: string, checked: boolean) => {
        setNotifications(currentNotifications =>
            currentNotifications.map(n =>
                n.id === id ? { ...n, status: checked ? 'Active' : 'Inactive' } : n
            )
        );
    };

    const isFlowActive = notifications.some(n => n.status === 'Active');

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
                                <p className="text-2xl font-bold">{flowData.topStats.impressions}</p>
                            </div>
                            <div className="p-4 text-center">
                                <p className="text-sm text-muted-foreground">Clicks</p>
                                <p className="text-2xl font-bold">{flowData.topStats.clicks}</p>
                            </div>
                             <div className="p-4 text-center">
                                <p className="text-sm text-muted-foreground">Revenue generated</p>
                                <p className="text-2xl font-bold">{flowData.topStats.revenue}</p>
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
                                        Activate a reminder to start sending these notifications.
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
                                                automationName='browse-abandonment'
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
