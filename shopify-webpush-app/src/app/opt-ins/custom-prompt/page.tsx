
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Upload, Crop, Smile, Check, Trash2, ImageIcon, Wifi, Signal, Battery, Square, Circle as CircleIcon, Triangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import dynamic from 'next/dynamic';
import { ImageEditorSheet } from '@/components/composer/editor-parts/image-editor-sheet';
import { useSettings } from '@/context/settings-context';
import { useToast } from '@/hooks/use-toast';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });

type DesktopPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
type MobilePosition = 'top' | 'bottom';

type OptInSettingsResponse = {
    ok: boolean;
    promptType: 'browser' | 'custom';
    title: string;
    message: string;
    allowText: string;
    allowBgColor: string;
    allowTextColor: string;
    laterText: string;
    logoUrl: string | null;
    desktopDelaySeconds: number;
    mobileDelaySeconds: number;
    maxDisplaysPerSession: number;
    hideForDays: number;
    desktopPosition: DesktopPosition;
    mobilePosition: MobilePosition;
    placementPreset: 'balanced' | 'safe-left' | 'safe-right' | 'safe-top' | 'safe-bottom';
    offsetX: number;
    offsetY: number;
    error?: string;
};


const DesktopScreen = ({ selected, onSelect }: { selected: string, onSelect: (pos: string) => void }) => {
    const positions = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
    return (
        <div className="w-full max-w-xs mx-auto">
            <div className="aspect-[16/10] bg-gray-50 dark:bg-gray-900 border-2 border-b-0 border-gray-300 dark:border-gray-700 rounded-t-lg p-2 flex flex-col justify-between">
                <div className="grid grid-cols-3 gap-2">
                    {positions.slice(0, 3).map(pos => (
                        <Button key={pos} variant="outline" size="sm" className={cn("h-12 w-full", selected === pos && "ring-2 ring-primary border-primary bg-primary/10")} onClick={() => onSelect(pos)}>
                            {selected === pos && <Check className="h-5 w-5 text-primary" />}
                        </Button>
                    ))}
                </div>
                 <div className="grid grid-cols-3 gap-2">
                    {positions.slice(3).map(pos => (
                        <Button key={pos} variant="outline" size="sm" className={cn("h-12 w-full", selected === pos && "ring-2 ring-primary border-primary bg-primary/10")} onClick={() => onSelect(pos)}>
                             {selected === pos && <Check className="h-5 w-5 text-primary" />}
                        </Button>
                    ))}
                </div>
            </div>
            <div className="h-4 bg-gray-300 dark:border-gray-700 border-2 border-t-0 rounded-b-lg relative">
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-4 w-12 bg-gray-300 dark:bg-gray-700 border-x-2 border-gray-300 dark:border-gray-700" />
            </div>
        </div>
    );
}

const MobileScreen = ({ selected, onSelect }: { selected: string, onSelect: (pos: string) => void }) => {
    const positions = ['top', 'bottom'];
    return (
        <div className="w-full max-w-[120px] mx-auto">
             <div className="aspect-[9/19] bg-gray-50 dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-700 rounded-2xl p-2 flex flex-col justify-between">
                 {positions.map(pos => (
                     <Button key={pos} variant="outline" size="sm" className={cn("h-24 w-full", selected === pos && "ring-2 ring-primary border-primary bg-primary/10")} onClick={() => onSelect(pos)}>
                         {selected === pos && <Check className="h-5 w-5 text-primary" />}
                    </Button>
                 ))}
             </div>
        </div>
    );
};

interface PreviewProps {
    title: string;
    message: string;
    allowText: string;
    laterText: string;
    allowBgColor: string;
    allowTextColor: string;
    logoPreview: string | null;
}

const DesktopPreview = ({ title, message, allowText, laterText, allowBgColor, allowTextColor, logoPreview }: PreviewProps) => (
    <div className="w-full max-w-lg mx-auto bg-background/10 p-4 rounded-lg relative">
        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-[calc(100%-4rem)] h-8 bg-gray-200 dark:bg-gray-700 rounded-t-md border-x border-t border-gray-300 dark:border-gray-600"></div>
        <div className="w-full h-auto bg-gray-100 dark:bg-gray-800 p-4 rounded-lg pt-12">
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg bg-background">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 flex items-center px-2 gap-1.5 rounded-t-lg border-b border-gray-300 dark:border-gray-600">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <div className="p-4 relative bg-gray-100/50 dark:bg-gray-800/20 flex justify-center items-center h-56">
                    <div className="w-[340px] bg-white dark:bg-card rounded-lg shadow-2xl p-4 font-sans text-left space-y-3 border border-gray-300/50 dark:border-gray-600/50">
                        <div className="flex items-center gap-3">
                            {logoPreview ? (
                                <Avatar className="h-12 w-12">
                                    <AvatarImage src={logoPreview} alt="Logo" />
                                    <AvatarFallback>PE</AvatarFallback>
                                </Avatar>
                            ) : (
                                <Avatar className="h-12 w-12 bg-gray-200">
                                    <ImageIcon className="h-6 w-6 text-gray-500 m-auto" />
                                </Avatar>
                            )}
                            <div>
                                <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200">{title || 'Never miss a sale 🛍️'}</h3>
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                    {message || 'Subscribe to get updates on our new products and exclusive promotions.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end items-center mt-3">
                            <Button variant="ghost" size="sm" className="text-gray-600 dark:text-gray-400 h-8">{laterText || 'Later'}</Button>
                            <Button size="sm" style={{ backgroundColor: allowBgColor, color: allowTextColor }} className="h-8">{allowText || 'Allow'}</Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);


const MobilePreview = ({ title, message, allowText, laterText, allowBgColor, allowTextColor, logoPreview }: PreviewProps) => (
     <div className="w-full max-w-xs mx-auto bg-background p-4 rounded-lg">
        <div className="border-[10px] border-black rounded-[40px] shadow-2xl overflow-hidden relative">
            <div className="aspect-[9/19] w-full bg-[#4A4A4A] flex flex-col relative">
                
                <div className="absolute top-0 left-0 right-0 px-4 pt-1 z-10">
                    <div className="flex justify-between items-center text-white">
                        <span className="text-xs font-semibold w-auto">9:41</span>
                        <div className="flex items-center justify-end gap-1 w-auto">
                            <Signal size={14} />
                            <Wifi size={14} />
                            <Battery size={18} />
                        </div>
                    </div>
                </div>

                 <div className="relative p-4 flex-grow flex items-start justify-center">
                    <div className="w-full max-w-[300px] bg-white dark:bg-card rounded-xl shadow-lg p-3 font-sans text-left space-y-2 mt-8">
                         <div className="flex items-center gap-3">
                             {logoPreview ? (
                                <Avatar className="h-12 w-12">
                                    <AvatarImage src={logoPreview} alt="Logo"/>
                                    <AvatarFallback>PE</AvatarFallback>
                                </Avatar>
                            ) : (
                                <Avatar className="h-12 w-12 bg-gray-200">
                                    <ImageIcon className="h-6 w-6 text-gray-500 m-auto" />
                                </Avatar>
                            )}
                            <div className="flex-1">
                                <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200 leading-tight">{title || 'Never miss a sale 🛍️'}</h3>
                                <p className="text-xs text-gray-600 dark:text-gray-400 leading-tight mt-0.5">
                                    {message || 'Subscribe to get updates.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end items-center mt-2">
                            <Button variant="ghost" size="sm" className="text-gray-600 dark:text-gray-400 h-8 px-3">{laterText || 'Later'}</Button>
                            <Button size="sm" style={{ backgroundColor: allowBgColor, color: allowTextColor }} className="h-8 px-4">{allowText || 'Allow'}</Button>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-12 bg-black/20 backdrop-blur-sm z-10 flex items-center justify-around">
                    <Triangle className="h-4 w-4 text-white/80 rotate-[-90deg] fill-white/80" />
                    <CircleIcon className="h-5 w-5 text-white/80 fill-white/80" />
                    <Square className="h-4 w-4 text-white/80 fill-white/80" />
                </div>

                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-xl"></div>
            </div>
        </div>
    </div>
);


export default function CustomPromptPage() {
    const searchParams = useSearchParams();
    const [desktopPosition, setDesktopPosition] = useState<DesktopPosition>('top-center');
    const [mobilePosition, setMobilePosition] = useState<MobilePosition>('top');
    const [title, setTitle] = useState('Never miss a sale 🛍️');
    const [message, setMessage] = useState('Subscribe to get updates on our new products and exclusive promotions.');
    const [allowText, setAllowText] = useState('Allow');
    const [allowBgColor, setAllowBgColor] = useState('#2e5fdc');
    const [allowTextColor, setAllowTextColor] = useState('#ffffff');
    const [laterText, setLaterText] = useState('Later');
    const [desktopDelaySeconds, setDesktopDelaySeconds] = useState('5');
    const [mobileDelaySeconds, setMobileDelaySeconds] = useState('10');
    const [maxDisplaysPerSession, setMaxDisplaysPerSession] = useState('10');
    const [hideForDays, setHideForDays] = useState('2');
    const [placementPreset, setPlacementPreset] = useState<'balanced' | 'safe-left' | 'safe-right' | 'safe-top' | 'safe-bottom'>('balanced');
    const [offsetX, setOffsetX] = useState('0');
    const [offsetY, setOffsetY] = useState('0');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [resolvedShopDomain, setResolvedShopDomain] = useState('');
    const { logo, setLogo, shopDomain } = useSettings();
    const { toast } = useToast();
    const logoInputRef = useRef<HTMLInputElement | null>(null);

    const [editingState, setEditingState] = useState<{ url: string; aspect: number, type: string } | null>(null);

    const delayOptions = [3, 5, 10, ...Array.from({ length: 11 }, (_, i) => 15 + i * 5)];

    const normalizeShopDomain = (value: string) => value.trim().toLowerCase();
    const isValidShopDomain = (value: string) => value.endsWith('.myshopify.com');

    useEffect(() => {
        const fromContext = normalizeShopDomain(shopDomain || '');
        const fromQuery = normalizeShopDomain(searchParams.get('shop') || '');
        const fromStorage = normalizeShopDomain(localStorage.getItem('shopDomain') || '');

        const candidate = [fromContext, fromQuery, fromStorage].find((value) => value && isValidShopDomain(value)) || '';
        setResolvedShopDomain(candidate);
    }, [searchParams, shopDomain]);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setLogo({ file, preview: reader.result as string });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSaveCrop = (dataUrl: string) => {
        setLogo({ file: null, preview: dataUrl });
        setEditingState(null);
    };

    useEffect(() => {
        setLoadError(null);
        if (!resolvedShopDomain) {
            setLoading(false);
            setLoadError('Missing Shopify shop context. Re-open the app from Shopify Admin so the shop parameter is available.');
            return;
        }

        let isMounted = true;
        setLoading(true);

        fetch(`/api/settings/opt-in?shop=${encodeURIComponent(resolvedShopDomain)}`)
            .then(async (res) => {
                const data = (await res.json()) as OptInSettingsResponse;
                if (!res.ok || !data?.ok || !isMounted) {
                    throw new Error(data?.error ?? 'Failed to load opt-in settings.');
                }

                setTitle(data.title);
                setMessage(data.message);
                setAllowText(data.allowText);
                setAllowBgColor(data.allowBgColor);
                setAllowTextColor(data.allowTextColor);
                setLaterText(data.laterText);
                setDesktopDelaySeconds(String(data.desktopDelaySeconds));
                setMobileDelaySeconds(String(data.mobileDelaySeconds));
                setMaxDisplaysPerSession(String(data.maxDisplaysPerSession));
                setHideForDays(String(data.hideForDays));
                setDesktopPosition(data.desktopPosition);
                setMobilePosition(data.mobilePosition);
                setPlacementPreset(data.placementPreset);
                setOffsetX(String(data.offsetX));
                setOffsetY(String(data.offsetY));
                setLogo({ file: null, preview: data.logoUrl ?? null });
            })
            .catch((error) => {
                if (!isMounted) {
                    return;
                }

                const message = error instanceof Error ? error.message : 'Unexpected error while loading prompt settings.';
                setLoadError(message);

                toast({
                    variant: 'destructive',
                    title: 'Failed to load custom prompt settings',
                    description: message,
                });
            })
            .finally(() => {
                if (isMounted) {
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [resolvedShopDomain, setLogo, toast]);

    const saveChanges = async () => {
        if (!resolvedShopDomain) {
            const message = 'Open the dashboard from a connected Shopify store before saving opt-in settings.';
            setSaveStatus({ type: 'error', message });
            toast({
                variant: 'destructive',
                title: 'Shop domain required',
                description: message,
            });
            return;
        }

        setSaving(true);
        setSaveStatus(null);
        try {
            const response = await fetch('/api/settings/opt-in', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    shopDomain: resolvedShopDomain,
                    promptType: 'custom',
                    title,
                    message,
                    allowText,
                    allowBgColor,
                    allowTextColor,
                    laterText,
                    logoUrl: logo.preview ?? null,
                    desktopDelaySeconds: Number(desktopDelaySeconds),
                    mobileDelaySeconds: Number(mobileDelaySeconds),
                    maxDisplaysPerSession: Number(maxDisplaysPerSession),
                    hideForDays: Number(hideForDays),
                    desktopPosition,
                    mobilePosition,
                    placementPreset,
                    offsetX: Number(offsetX),
                    offsetY: Number(offsetY),
                }),
            });

            const raw = await response.text();
            const result = (raw ? JSON.parse(raw) : {}) as OptInSettingsResponse;
            if (!response.ok || !result?.ok) {
                throw new Error(result?.error ?? 'Failed to save custom prompt settings.');
            }

            const savedAt = new Date().toLocaleTimeString();
            setSaveStatus({ type: 'success', message: `Settings saved successfully at ${savedAt}.` });

            toast({
                title: 'Custom prompt saved',
                description: 'The live storefront popup now uses these settings.',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unexpected error while saving custom prompt settings.';
            setSaveStatus({ type: 'error', message });
            toast({
                variant: 'destructive',
                title: 'Save failed',
                description: message,
            });
        } finally {
            setSaving(false);
        }
    };
    
    return (
        <div className="flex flex-col min-h-screen">
            <div className="bg-card p-4 sm:p-6 md:p-8">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" asChild>
                        <Link href="/opt-ins">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="sr-only">Back to Opt-ins</span>
                        </Link>
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Custom prompt</h1>
                </div>
            </div>
            
            <div className="p-4 sm:p-6 md:p-8 flex-grow">
                {loadError && (
                    <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        Failed to load saved settings: {loadError}
                    </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8">
                        <Card>
                            <CardHeader>
                                <CardTitle>Opt-in details</CardTitle>
                                <CardDescription>Customize the opt-in that is shown to your store visitors.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <Avatar className="h-20 w-20">
                                        <AvatarImage src={logo.preview || undefined} />
                                        <AvatarFallback>
                                            <ImageIcon className="h-8 w-8 text-gray-400"/>
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <p className="font-medium">Logo</p>
                                        <p className="text-xs text-muted-foreground">Recommended size: 200x200 pixels</p>
                                        <div className="flex items-center gap-1 mt-1">
                                            <Button variant="ghost" size="icon" onClick={() => logo.preview && setEditingState({url: logo.preview, aspect: 1, type: 'logo'})} disabled={!logo.preview}><Crop className="h-4 w-4" /></Button>
                                            <Button variant="ghost" size="icon" onClick={() => logoInputRef.current?.click()}><Upload className="h-4 w-4" /></Button>
                                            <Input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload} />
                                            {logo.preview && <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setLogo({file: null, preview: null})}><Trash2 className="h-4 w-4" /></Button>}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="title">Title</Label>
                                    <div className="relative">
                                        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground">
                                                    <Smile className="h-4 w-4" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 border-0">
                                               <EmojiPicker onEmojiClick={(emoji) => setTitle(prev => prev + emoji.emoji)} />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="message">Message</Label>
                                     <div className="relative">
                                        <Textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} />
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="ghost" size="icon" className="absolute right-1 bottom-1 h-8 w-8 text-muted-foreground">
                                                    <Smile className="h-4 w-4" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 border-0">
                                               <EmojiPicker onEmojiClick={(emoji) => setMessage(prev => prev + emoji.emoji)} />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <Card>
                                <CardHeader><CardTitle>Allow Button</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="allow-text">Text *</Label>
                                        <Input id="allow-text" value={allowText} onChange={(e) => setAllowText(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="allow-bg">Background Color</Label>
                                        <div className="flex items-center gap-2">
                                            <Input type="color" value={allowBgColor} onChange={(e) => setAllowBgColor(e.target.value)} className="p-1 h-10 w-10" />
                                            <Input id="allow-bg" value={allowBgColor} onChange={(e) => setAllowBgColor(e.target.value)} />
                                        </div>
                                    </div>
                                     <div className="space-y-2">
                                        <Label htmlFor="allow-text-color">Text Color</Label>
                                        <div className="flex items-center gap-2">
                                            <Input type="color" value={allowTextColor} onChange={(e) => setAllowTextColor(e.target.value)} className="p-1 h-10 w-10"/>
                                            <Input id="allow-text-color" value={allowTextColor} onChange={(e) => setAllowTextColor(e.target.value)} />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardHeader><CardTitle>Later Button</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                     <div className="space-y-2">
                                        <Label htmlFor="later-text">Text *</Label>
                                        <Input id="later-text" value={laterText} onChange={(e) => setLaterText(e.target.value)} />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                        
                        <Card>
                            <CardHeader>
                                <CardTitle>Opt-in timings</CardTitle>
                                <CardDescription>Set a timer according to when you want the browser prompt to be shown.</CardDescription>
                            </CardHeader>
                             <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label>Desktop</Label>
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm text-muted-foreground whitespace-nowrap">Show prompt after</p>
                                            <Select value={desktopDelaySeconds} onValueChange={setDesktopDelaySeconds}>
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
                                            <Select value={mobileDelaySeconds} onValueChange={setMobileDelaySeconds}>
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
                                        <Input type="number" value={maxDisplaysPerSession} onChange={(e) => setMaxDisplaysPerSession(e.target.value)} min="1" max="10" className="w-20" />
                                        <p className="text-sm text-muted-foreground">times per session</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Frequency</Label>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm text-muted-foreground">Hide the prompt for</p>
                                        <Input type="number" value={hideForDays} onChange={(e) => setHideForDays(e.target.value)} min="1" max="30" className="w-20" />
                                        <p className="text-sm text-muted-foreground">days after it is shown to a visitor</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Opt-in Position</CardTitle>
                                <CardDescription>Customize your opt-in placement on your website.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>Desktop</Label>
                                    <Select value={desktopPosition} onValueChange={setDesktopPosition}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="top-left">Top-left</SelectItem>
                                            <SelectItem value="top-center">Top-center</SelectItem>
                                            <SelectItem value="top-right">Top-right</SelectItem>
                                            <SelectItem value="bottom-left">Bottom-left</SelectItem>
                                            <SelectItem value="bottom-center">Bottom-center</SelectItem>
                                            <SelectItem value="bottom-right">Bottom-right</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <DesktopScreen selected={desktopPosition} onSelect={setDesktopPosition} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Mobile</Label>
                                    <Select value={mobilePosition} onValueChange={setMobilePosition}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="top">Top</SelectItem>
                                            <SelectItem value="bottom">Bottom</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <MobileScreen selected={mobilePosition} onSelect={setMobilePosition} />
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>Fine Position Controls</CardTitle>
                                <CardDescription>Use presets for quick alignment, then nudge left/right/up/down to avoid overlapping store elements.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2 md:col-span-1">
                                    <Label>Placement preset</Label>
                                    <Select value={placementPreset} onValueChange={(value) => setPlacementPreset(value as 'balanced' | 'safe-left' | 'safe-right' | 'safe-top' | 'safe-bottom')}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="balanced">Balanced (default)</SelectItem>
                                            <SelectItem value="safe-left">Shift away from left overlays</SelectItem>
                                            <SelectItem value="safe-right">Shift away from right overlays</SelectItem>
                                            <SelectItem value="safe-top">Shift away from sticky headers</SelectItem>
                                            <SelectItem value="safe-bottom">Shift away from sticky footers</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Horizontal nudge (px)</Label>
                                    <div className="flex items-center gap-2">
                                        <Input type="number" min="-240" max="240" value={offsetX} onChange={(e) => setOffsetX(e.target.value)} />
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">left(-) / right(+)</span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Vertical nudge (px)</Label>
                                    <div className="flex items-center gap-2">
                                        <Input type="number" min="-240" max="240" value={offsetY} onChange={(e) => setOffsetY(e.target.value)} />
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">up(-) / down(+)</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <div className="space-y-8 sticky top-24">
                        <Card>
                            <CardHeader>
                                <CardTitle>Preview</CardTitle>
                                <CardDescription>These settings now control the live theme embed popup on your storefront.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs defaultValue="desktop">
                                    <TabsList className="grid w-full grid-cols-2">
                                        <TabsTrigger value="desktop">Desktop</TabsTrigger>
                                        <TabsTrigger value="mobile">Mobile</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="desktop" className="mt-4">
                                        <DesktopPreview 
                                            title={title}
                                            message={message}
                                            allowText={allowText}
                                            laterText={laterText}
                                            allowBgColor={allowBgColor}
                                            allowTextColor={allowTextColor}
                                            logoPreview={logo.preview}
                                        />
                                    </TabsContent>
                                    <TabsContent value="mobile" className="mt-4">
                                        <MobilePreview 
                                            title={title}
                                            message={message}
                                            allowText={allowText}
                                            laterText={laterText}
                                            allowBgColor={allowBgColor}
                                            allowTextColor={allowTextColor}
                                            logoPreview={logo.preview}
                                        />
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="fixed bottom-8 right-8 z-50 flex gap-2">
                    {saveStatus && (
                        <div className={cn(
                            'rounded-md border px-3 py-2 text-sm max-w-[360px]',
                            saveStatus.type === 'success'
                                ? 'border-green-300 bg-green-50 text-green-900'
                                : 'border-destructive/40 bg-destructive/10 text-destructive'
                        )}>
                            {saveStatus.message}
                        </div>
                    )}
                    <Button variant="outline" size="lg" asChild>
                      <Link href="/opt-ins">Cancel</Link>
                    </Button>
                    <Button size="lg" onClick={saveChanges} disabled={saving || loading}>
                        {(saving || loading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {loading ? 'Loading...' : saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </div>

            <ImageEditorSheet 
                editingState={editingState}
                setEditingState={setEditingState}
                onSave={handleSaveCrop}
            />
        </div>
    );
}
