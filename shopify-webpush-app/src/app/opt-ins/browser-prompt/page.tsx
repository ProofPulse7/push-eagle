
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Bell } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useSettings } from '@/context/settings-context';

const BrowserPromptPreview = () => {
    const { storeUrl } = useSettings();
    return (
        <div className="w-full max-w-lg mx-auto bg-background/10 p-4 rounded-lg relative">
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[calc(100%-12rem)] h-8 bg-gray-200 dark:bg-gray-700 rounded-t-md border-x border-t border-gray-300 dark:border-gray-600"></div>
            <div className="w-full h-auto bg-gray-100 dark:bg-gray-800 p-4 rounded-lg pt-12">
                <div className="border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg bg-background">
                    <div className="h-8 bg-gray-200 dark:bg-gray-700 flex items-center px-2 gap-1.5 rounded-t-lg border-b border-gray-300 dark:border-gray-600">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    </div>
                    <div className="p-4 relative bg-gray-100/50 dark:bg-gray-800/20 flex justify-center items-center h-56">
                        <div className="w-[380px] bg-white dark:bg-gray-900 rounded-lg shadow-2xl p-3 font-sans text-left space-y-3 border border-gray-300/50 dark:border-gray-600/50">
                            <div className='flex justify-between items-start'>
                                <div>
                                    <p className="text-sm font-medium text-foreground">{storeUrl} wants to</p>
                                </div>
                                <div className="flex items-center gap-2">
                                     <div className="bg-gray-200 dark:bg-gray-700 rounded-full p-0.5"><Bell className="h-3 w-3 text-muted-foreground" /></div>
                                    <button className="text-muted-foreground hover:text-foreground">&times;</button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                <Bell className="h-5 w-5 text-muted-foreground" />
                                <p className="text-sm text-foreground">Show notifications</p>
                            </div>
                            <div className="flex gap-2 justify-end mt-4 pt-2">
                                <Button size="sm" className="bg-[#e0eaff] hover:bg-[#d0deff] text-[#3b5998] rounded-full">Allow</Button>
                                <Button size="sm" className="bg-[#e0eaff] hover:bg-[#d0deff] text-[#3b5998] rounded-full">Block</Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


export default function BrowserPromptPage() {
    const delayOptions = [3, 5, 10, ...Array.from({ length: 11 }, (_, i) => 15 + i * 5)];
    const countOptions = Array.from({ length: 10 }, (_, i) => i + 1);

    return (
        <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
            <div className="bg-card p-6 rounded-lg relative overflow-hidden border">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" asChild>
                        <Link href="/opt-ins">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="sr-only">Back to Opt-ins</span>
                        </Link>
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Browser prompt</h1>
                </div>
                <Image
                    src="https://cdn.jsdelivr.net/gh/firebounty/sw-assests@main/custom-prompt-banner.png"
                    alt="Banner"
                    width={300}
                    height={60}
                    className="absolute -right-4 -top-2 opacity-50"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <div className="space-y-8 flex flex-col h-full">
                    <Card className="flex flex-col flex-grow">
                        <CardHeader>
                            <CardTitle>Opt-in timings</CardTitle>
                            <CardDescription>
                                Set a timer according to when you want the browser prompt to be shown
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>Desktop</Label>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm text-muted-foreground whitespace-nowrap">Show prompt after</p>
                                        <Select defaultValue="5">
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {delayOptions.map(opt => <SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-sm text-muted-foreground">seconds</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Mobile</Label>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm text-muted-foreground whitespace-nowrap">Show prompt after</p>
                                        <Select defaultValue="10">
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {delayOptions.map(opt => <SelectItem key={opt} value={String(opt)}>{opt}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-sm text-muted-foreground">seconds</p>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Max count per session</Label>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm text-muted-foreground">Show the prompt maximum</p>
                                    <Input type="number" defaultValue={10} min="1" max="10" className="w-20" />
                                    <p className="text-sm text-muted-foreground">times per session</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Frequency</Label>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm text-muted-foreground">Hide the prompt for</p>
                                    <Input type="number" defaultValue={2} min="1" max="10" className="w-20" />
                                    <p className="text-sm text-muted-foreground">days after it is shown to a visitor</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-8 sticky top-24 h-fit">
                    <Card>
                        <CardHeader>
                            <CardTitle>Preview</CardTitle>
                        </CardHeader>
                        <CardContent>
                           <BrowserPromptPreview />
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            <div className="flex justify-end gap-2 mt-auto">
                <Button variant="outline" asChild>
                    <Link href="/opt-ins">CANCEL</Link>
                </Button>
                <Button>SAVE CHANGES</Button>
            </div>
        </div>
    );
}
