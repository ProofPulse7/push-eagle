
'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowLeft, Book, ChevronLeft, ChevronRight, Copy, RefreshCw, Share, Smile, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSettings } from '@/context/settings-context';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

const ShareIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M13 6.5V1h-2v5.5L7.9 3.4 6.5 4.8l5.5 5.5 5.5-5.5-1.4-1.4L13 6.5zM18 9v9H6V9H4v9c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V9h-2z" />
    </svg>
);


const IOSWidgetPreview = ({ title, byline }: { title: string; byline: string }) => {
    const { storeUrl } = useSettings();

    const renderByline = (text: string) => {
        const parts = text.split(/(\{\{share icon\}\})/g);
        return parts.map((part, index) => {
            if (part === '{{share icon}}') {
                return <ShareIcon key={index} className="inline-block h-4 w-4 align-text-bottom text-blue-500" />;
            }
            return <span key={index}>{part}</span>;
        });
    };
    
    return (
        <div className="w-full max-w-sm mx-auto font-sans">
            <div className="bg-gray-100 dark:bg-gray-900/50 rounded-xl shadow-lg border relative">
                <div className="p-4 bg-white dark:bg-gray-800 rounded-lg">
                    {/* Popup */}
                    <div className="absolute top-4 left-4 right-4 bg-gray-800/80 dark:bg-gray-900/80 text-white rounded-xl shadow-2xl p-4 backdrop-blur-sm z-10">
                        <div className="flex justify-between items-start">
                            <h3 className="font-semibold text-sm">{title || 'Never Miss Out with Web Push'}</h3>
                            <button className="text-gray-400 hover:text-white"><X className="h-4 w-4" /></button>
                        </div>
                        <p className="text-sm mt-1 text-gray-300">
                            {byline ? renderByline(byline) : "Add our website to your home screen..."}
                        </p>
                    </div>

                    {/* Address Bar */}
                    <div className="flex items-center gap-2 bg-gray-200 dark:bg-gray-700 p-2 rounded-lg">
                        <span className="text-xs font-serif">AA</span>
                        <div className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs rounded-md p-1.5 flex items-center justify-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                            <span>{storeUrl}</span>
                        </div>
                        <RefreshCw className="h-4 w-4" />
                    </div>

                     <div className="h-48 bg-gray-50 dark:bg-gray-700/50 rounded-md mt-2"></div>
                </div>

                 {/* Browser Chrome */}
                <div className="absolute bottom-0 left-0 right-0 p-3 pt-2 bg-gray-200/80 dark:bg-gray-900/80 backdrop-blur-sm border-t border-gray-300/50 dark:border-gray-700/50">
                    <div className="flex items-center justify-between text-blue-500">
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 dark:text-gray-600"><ChevronLeft className="h-6 w-6" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 dark:text-gray-600" disabled><ChevronRight className="h-6 w-6" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-500"><ShareIcon className="h-6 w-6" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-500"><Book className="h-6 w-6" /></Button>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-blue-500"><Square className="h-5 w-5" /></Button>
                    </div>
                     <div className="w-32 h-1 bg-black rounded-full mx-auto mt-2"></div>
                </div>
            </div>
        </div>
    );
};


export default function IOSWidgetPage() {
    const [title, setTitle] = useState('Never Miss Out with Web Push');
    const [byline, setByline] = useState("Add our website to your home screen and get notified of exclusive offers, new arrivals and more! It's easy: just tap the {{share icon}} icon and select 'Add to Home Screen'");

    const handleBylineEmojiSelect = (emoji: { emoji: string }) => {
        setByline(prev => prev + emoji.emoji);
    };

    return (
        <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href="/opt-ins">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="sr-only">Back to Opt-ins</span>
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">iOS widget</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <Card>
                    <CardHeader>
                        <CardTitle>Content</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="title">Title</Label>
                            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="byline">Byline</Label>
                            <div className="relative">
                                <Textarea 
                                    id="byline" 
                                    value={byline} 
                                    onChange={(e) => setByline(e.target.value)} 
                                    className="min-h-[120px] pr-10"
                                />
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-8 w-8 text-muted-foreground">
                                            <Smile className="h-4 w-4" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 border-0">
                                       <EmojiPicker onEmojiClick={handleBylineEmojiSelect} />
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                Type {'{{share icon}}'} to include the <ShareIcon className="inline-block h-3.5 w-3.5" /> share icon.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <IOSWidgetPreview title={title} byline={byline} />
                    </CardContent>
                </Card>
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
