
'use client';

import React, { useState, Fragment } from 'react';
import Link from 'next/link';
import { ArrowLeft, Zap, TabletSmartphone, ChevronDown, Clock } from 'lucide-react';

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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineNotificationPreview } from '@/components/automations/inline-notification-preview';
import { formatCurrency } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


const flowData = {
    title: "Price Drop",
    stats: {
        impressions: 980,
        clicks: 150,
        revenue: formatCurrency(500)
    },
    trigger: "When the price of a product is dropped",
    notifications: [
        {
            id: 'price-1',
            title: "Price Drop Alert",
            notification: {
                title: "Price Drop Alert!",
                message: "Good news! The price of an item you liked has just dropped. Check it out now!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: "https://placehold.co/728x360.png",
                siteName: "chrome.zahoorshop.com",
                actionButtons: [{title: 'View Item', link: '#'}]
            }
        }
    ]
}

export default function PriceDropPage() {
    const [previewDevice, setPreviewDevice] = useState<'windows' | 'macos' | 'android' | 'ios'>('android');
    const notifications = flowData.notifications;
    
    const deviceName = previewDevice.charAt(0).toUpperCase() + previewDevice.slice(1);

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
                
                <div className="mb-2">
                     <Card>
                        <CardContent className="p-0">
                            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x">
                                <div className="p-4 text-center">
                                    <p className="text-sm text-muted-foreground">Impressions</p>
                                    <p className="text-2xl font-bold">{flowData.stats.impressions.toLocaleString()}</p>
                                </div>
                                <div className="p-4 text-center">
                                    <p className="text-sm text-muted-foreground">Clicks</p>
                                    <p className="text-2xl font-bold">{flowData.stats.clicks.toLocaleString()}</p>
                                </div>
                                <div className="p-4 text-center">
                                    <p className="text-sm text-muted-foreground">Revenue generated</p>
                                    <p className="text-2xl font-bold">{flowData.stats.revenue}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                
                <Tabs defaultValue="flow">
                    <div className="flex justify-between items-center">
                        <TabsList>
                            <TabsTrigger value="flow">Flow</TabsTrigger>
                            <TabsTrigger value="widget">Widget</TabsTrigger>
                            <TabsTrigger value="wait-list">Wait list</TabsTrigger>
                            <TabsTrigger value="sent-list">Sent list</TabsTrigger>
                        </TabsList>
                        <div className="flex items-center gap-2">
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
                                    <DropdownMenuRadioGroup value={previewDevice} onValueChange={(value) => setPreviewDevice(value as any)}>
                                        <DropdownMenuRadioItem value="android">Android</DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="windows">Windows</DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="macos">macOS</DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="ios">iOS</DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    <TabsContent value="flow" className="mt-6">
                        <div className="max-w-md mx-auto w-full flex flex-col items-center">
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
                                            <Card className="border-l-4 border-l-primary">
                                                <CardHeader className="p-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <CardTitle className="text-xs font-semibold">{step.title}</CardTitle>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                            <Clock className="h-3 w-3" />
                                                            <span>Sends immediately</span>
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-0">
                                                    <InlineNotificationPreview notification={step.notification} device={previewDevice} />
                                                </CardContent>
                                                <CardFooter className="p-2">
                                                    <Button variant="default" size="sm" className="w-full" asChild>
                                                        <Link href={`/automations/price-drop/${step.id}/edit`}>
                                                            Edit automation
                                                        </Link>
                                                    </Button>
                                                </CardFooter>
                                            </Card>
                                        </div>
                                        {index < notifications.length - 1 && (
                                            <div className="my-4 h-8 border-l-2 border-dashed border-gray-600" />
                                        )}
                                    </Fragment>
                                ))}
                            </div>
                        </div>
                    </TabsContent>
                    <TabsContent value="widget">
                         <Card>
                            <CardContent className="p-6 text-center">
                                <p className="text-muted-foreground">Widget settings will be shown here.</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="wait-list">
                         <Card>
                            <CardContent className="p-6 text-center">
                                <p className="text-muted-foreground">Wait list will be shown here.</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="sent-list">
                         <Card>
                            <CardContent className="p-6 text-center">
                                <p className="text-muted-foreground">Sent list will be shown here.</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
