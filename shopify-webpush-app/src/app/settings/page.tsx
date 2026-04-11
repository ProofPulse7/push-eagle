
'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Settings, Upload, Crop, ExternalLink, Copy, Info, Check, Wand2, Moon, Sun } from 'lucide-react';
import Image from 'next/image';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useTheme } from 'next-themes';
import { useSettings } from '@/context/settings-context';
import { ImageEditorSheet } from '@/components/composer/editor-parts/image-editor-sheet';
import { useToast } from '@/hooks/use-toast';

type MerchantOverview = {
    storeName: string | null;
    email: string | null;
    storeUrl: string | null;
    myshopifyDomain: string;
    currencyCode: string | null;
    timezone: string | null;
    planName: string | null;
    ownerName: string | null;
    scopes: string | null;
    subscriberCount: number;
    customerCount: number;
    campaignCount: number;
    uninstalledAt: string | null;
};

const SettingsSection = ({ title, children, description }: { title: string, children: React.ReactNode, description?: string }) => (
    <div className="space-y-4 first:pt-0 pt-8 has-[hr]:pt-4">
        <div className='mb-4'>
            <div className="flex items-center gap-4">
                <h4 className="font-semibold text-base">{title}</h4>
                {description && <Button variant="link" className="text-xs h-auto p-0">Learn more</Button>}
            </div>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        <div className="space-y-4 bg-muted/50 p-4 rounded-lg border">
            {children}
        </div>
    </div>
);

const WarningAlert = ({ children }: { children: React.ReactNode }) => (
    <Alert className="bg-yellow-100/50 border-yellow-400/50 text-yellow-800 mt-2 dark:bg-yellow-900/20 dark:border-yellow-500/30 dark:text-yellow-300">
        <AlertDescription className="flex items-center gap-2">
            <Info className="h-4 w-4 text-yellow-600 shrink-0 dark:text-yellow-400" />
            <span>{children}</span>
        </AlertDescription>
    </Alert>
)

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
    const {
        storeUrl,
        setStoreUrl,
        shopDomain,
        setShopDomain,
        logo,
        setLogo,
        attributionModel,
        setAttributionModel,
        clickWindowDays,
        setClickWindowDays,
        impressionWindowDays,
        setImpressionWindowDays,
    } = useSettings();
    const { toast } = useToast();
  const [allowSupport, setAllowSupport] = useState(true);
  const [ipAddressOption, setIpAddressOption] = useState('anonymized');
  const [enableGeo, setEnableGeo] = useState(true);
  const [enablePreferences, setEnablePreferences] = useState(false);
  const [emailStoreOption, setEmailStoreOption] = useState('full-email');
  const [locationStoreOption, setLocationStoreOption] = useState('yes');
  const [nameStoreOption, setNameStoreOption] = useState('yes');
    const [overview, setOverview] = useState<MerchantOverview | null>(null);
        const [overviewRefreshTick, setOverviewRefreshTick] = useState(0);
  
  const [editingState, setEditingState] = useState<{ url: string; aspect: number, type: string } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!shopDomain) {
            return;
        }

        let isMounted = true;
        fetch(`/api/settings/attribution?shop=${encodeURIComponent(shopDomain)}`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok || !data?.ok || !isMounted) {
                    return;
                }
                setAttributionModel(data.attributionModel);
                setClickWindowDays(data.clickWindowDays);
                setImpressionWindowDays(data.impressionWindowDays);
            })
            .catch(() => undefined);

        return () => {
            isMounted = false;
        };
    }, [shopDomain, setAttributionModel, setClickWindowDays, setImpressionWindowDays]);

    useEffect(() => {
        if (!shopDomain) {
            return;
        }

        let isMounted = true;
        fetch(`/api/settings/overview?shop=${encodeURIComponent(shopDomain)}`)
            .then(async (res) => {
                const data = await res.json();
                if (!res.ok || !data?.ok || !isMounted) {
                    return;
                }

                setOverview({
                    storeName: data.storeName ?? null,
                    email: data.email ?? null,
                    storeUrl: data.storeUrl ?? null,
                    myshopifyDomain: data.myshopifyDomain ?? shopDomain,
                    currencyCode: data.currencyCode ?? null,
                    timezone: data.timezone ?? null,
                    planName: data.planName ?? null,
                    ownerName: data.ownerName ?? null,
                    scopes: data.scopes ?? null,
                    subscriberCount: Number(data.subscriberCount ?? 0),
                    customerCount: Number(data.customerCount ?? 0),
                    campaignCount: Number(data.campaignCount ?? 0),
                    uninstalledAt: data.uninstalledAt ?? null,
                });

                if (data.storeUrl && data.storeUrl !== storeUrl) {
                    setStoreUrl(data.storeUrl);
                }
            })
            .catch(() => undefined);

        return () => {
            isMounted = false;
        };
    }, [shopDomain, setStoreUrl, storeUrl, overviewRefreshTick]);

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

    const saveAttributionSettings = async () => {
        if (!shopDomain) {
            toast({
                variant: 'destructive',
                title: 'Shop domain required',
                description: 'Please enter your Shopify subdomain before saving attribution settings.',
            });
            return;
        }

        const response = await fetch('/api/settings/attribution', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                shopDomain,
                attributionModel,
                clickWindowDays,
                impressionWindowDays,
            }),
        });

        const result = await response.json();
        if (!response.ok || !result?.ok) {
            toast({
                variant: 'destructive',
                title: 'Failed to save attribution settings',
                description: result?.error ?? 'Unexpected error while saving attribution settings.',
            });
            return;
        }

        toast({
            title: 'Attribution settings saved',
            description: 'Your attribution model and windows are now active.',
        });
    };


  return (
    <div className="flex flex-col gap-8">
        {/* Header Banner */}
        <div className="bg-card p-6 rounded-b-lg relative overflow-hidden">
            <div className="flex items-center gap-3">
                <Settings className="h-6 w-6" />
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
            </div>
             <Image 
                src="https://cdn.jsdelivr.net/gh/firebounty/sw-assests@main/settings-banner.png" 
                alt="Settings banner"
                width={300}
                height={60}
                className="absolute -right-4 -top-2 opacity-50"
            />
        </div>

      <div className="px-4 sm:px-6 md:px-8">
        <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4 max-w-lg">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="appearance">Appearance</TabsTrigger>
                <TabsTrigger value="privacy">Privacy</TabsTrigger>
                <TabsTrigger value="attribution">Attribution</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
            <Card className="mt-4">
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Store Details</CardTitle>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOverviewRefreshTick((value) => value + 1)}
                    >
                        Refresh details
                    </Button>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div className="flex items-center gap-4">
                         <Avatar className="h-24 w-24 border-2 border-primary/20">
                            <AvatarImage src={logo.preview || "https://raw.githubusercontent.com/zaid-commits/firebounty-assets/main/pusheagle-logo.png"} alt="Store Logo" />
                            <AvatarFallback>PE</AvatarFallback>
                        </Avatar>
                        <div className="space-y-2">
                            <p className="font-medium">Logo</p>
                            <p className="text-xs text-muted-foreground">Recommended size: 200x200 pixels</p>
                            <div className="flex items-center gap-2">
                                <Button variant="ghost" size="icon" onClick={() => logo.preview && setEditingState({url: logo.preview, aspect: 1, type: 'logo'})} disabled={!logo.preview}><Crop className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => logoInputRef.current?.click()}><Upload className="h-4 w-4" /></Button>
                                <Input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={handleLogoUpload} />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                                                        <Input
                                                            id="username"
                                                            value={overview?.ownerName || overview?.storeName || ''}
                                                            readOnly
                                                        />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="store-name">Store Name</Label>
                                                        <Input id="store-name" value={overview?.storeName || ''} readOnly />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="store-url">Store URL</Label>
                            <div className="relative">
                                <Input id="store-url" value={overview?.storeUrl || storeUrl || ''} onChange={(e) => setStoreUrl(e.target.value)} />
                                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground">
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="subdomain">Subdomain</Label>
                             <div className="relative">
                                          <Input
                                             id="subdomain"
                                                            value={shopDomain || overview?.myshopifyDomain || ''}
                                             onChange={(e) => setShopDomain(e.target.value)}
                                             placeholder="your-store.myshopify.com"
                                             className="pr-10"
                                          />
                                 <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground">
                                    <Copy className="h-4 w-4" />
                                 </Button>
                            </div>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="platform">Platform</Label>
                             <div className="relative">
                                <Input id="platform" value="Shopify" className="pr-10" readOnly />
                                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground">
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="merchant-email">Merchant Email</Label>
                            <Input id="merchant-email" value={overview?.email || ''} readOnly />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="currency">Currency</Label>
                            <Input id="currency" value={overview?.currencyCode || ''} readOnly />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="timezone">Timezone</Label>
                            <Input id="timezone" value={overview?.timezone || ''} readOnly />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Badge variant="secondary" className="justify-center py-2">Subscribers: {overview?.subscriberCount ?? 0}</Badge>
                        <Badge variant="secondary" className="justify-center py-2">Customers: {overview?.customerCount ?? 0}</Badge>
                        <Badge variant="secondary" className="justify-center py-2">Campaigns: {overview?.campaignCount ?? 0}</Badge>
                    </div>
                     <div className="space-y-4 pt-4 border-t">
                        <h3 className="text-lg font-semibold">Current Plan</h3>
                        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                            <div>
                                <p className="font-semibold">{overview?.planName || 'BASIC (0$/month)'}</p>
                            </div>
                            <Button variant="outline" className="border-yellow-500 text-yellow-600 hover:bg-yellow-500/10 hover:text-yellow-700">Change Plan</Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
            </TabsContent>
            <TabsContent value="appearance">
                 <Card className="mt-4">
                    <CardHeader>
                        <CardTitle>Appearance</CardTitle>
                        <CardDescription>Customize the look and feel of your dashboard.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            <Label>Theme</Label>
                            <p className="text-sm text-muted-foreground">Select the theme for the dashboard.</p>
                            <div className="flex items-center space-x-2 pt-2">
                               <Button variant={theme === 'light' ? 'default' : 'outline'} onClick={() => setTheme('light')}>
                                    <Sun className="mr-2 h-4 w-4" />
                                    Light
                                </Button>
                               <Button variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => setTheme('dark')}>
                                    <Moon className="mr-2 h-4 w-4" />
                                    Dark
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                 </Card>
            </TabsContent>
            <TabsContent value="privacy">
                <div className="space-y-6 mt-4">
                    <Card>
                        <CardHeader><CardTitle>User</CardTitle></CardHeader>
                        <CardContent>
                            <SettingsSection title="LIMITED ACCESS" description="PushEagle uses third-party integrations and tools to offer better support to our users. These tools help our team diagnose and fix issues faced by you. You can choose to disable this feature if you don't need access to support and/or critical updates regarding your store.">
                                 <div className="flex items-start gap-3 p-3 rounded-md bg-background/50 border">
                                    <Checkbox id="allow-support" checked={allowSupport} onCheckedChange={(checked) => setAllowSupport(!!checked)} className="mt-1" />
                                    <div className="grid gap-1.5 leading-none w-full">
                                        <Label htmlFor="allow-support" className="font-medium cursor-pointer">
                                            Allow PushEagle to use support tools
                                            <Badge variant="outline" className="ml-2 border-yellow-400 text-yellow-600">Recommended</Badge>
                                        </Label>
                                         {!allowSupport && (
                                            <WarningAlert>
                                                PushEagle Support will not be able to access your store. Please allow access again if you open any support ticket.
                                            </WarningAlert>
                                        )}
                                    </div>
                                </div>
                            </SettingsSection>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>Subscriber</CardTitle></CardHeader>
                        <CardContent>
                             <SettingsSection title="IP ADDRESS" description="Choose whether or not you want to collect and store the anonymized IP addresses (classified as personal data under GDPR) of your subscribers. By storing the last octet of the IP address, the subscriber is anonymized to a sufficient degree, ensuring your GDPR compliance.">
                                <RadioGroup value={ipAddressOption} onValueChange={setIpAddressOption} className="space-y-2">
                                    <div className="flex items-center gap-3 p-3 rounded-md bg-background/50 border">
                                        <RadioGroupItem value="anonymized" id="anonymized" />
                                        <Label htmlFor="anonymized" className="font-medium cursor-pointer w-full">
                                            Collect anonymized IP address (Recommended)
                                            <Info className="inline-block ml-2 h-4 w-4 text-yellow-500" />
                                        </Label>
                                    </div>
                                    <div className="flex items-center gap-3 p-3 rounded-md bg-background/50 border">
                                        <RadioGroupItem value="no-ip" id="no-ip" />
                                        <div className="grid gap-1.5 leading-none w-full">
                                            <Label htmlFor="no-ip" className="font-medium cursor-pointer">
                                                Do not collect any IP address
                                            </Label>
                                             {ipAddressOption === 'no-ip' && (
                                                <WarningAlert>
                                                    PushEagle has stopped accessing IP addresses. This may affect few features.
                                                </WarningAlert>
                                            )}
                                        </div>
                                    </div>
                                </RadioGroup>
                            </SettingsSection>
                            <Separator className="my-6" />
                             <SettingsSection title="GEO-LOCATION" description="By enabling geo-location, PushEagle will collect IP addresses in order to get the location information about your subscribers. As soon as the location data is collected, the IP address will be deleted instantly, leaving the subscriber as anonymous. Recommended.">
                                <div className="flex items-start gap-3 p-3 rounded-md bg-background/50 border">
                                    <Checkbox id="enable-geo" checked={enableGeo} onCheckedChange={(checked) => setEnableGeo(!!checked)} className="mt-1" />
                                    <div className="grid gap-1.5 leading-none w-full">
                                        <Label htmlFor="enable-geo" className="font-medium cursor-pointer">
                                            Enable Geo Location
                                            <Badge variant="outline" className="ml-2 border-yellow-400 text-yellow-600">Recommended</Badge>
                                        </Label>
                                         {!enableGeo && (
                                            <WarningAlert>
                                                PushEagle has stopped accessing geo-location. This will affect location based features.
                                            </WarningAlert>
                                        )}
                                    </div>
                                </div>
                            </SettingsSection>
                             <Separator className="my-6" />
                             <SettingsSection title="NOTIFICATION PREFERENCES" description="You can choose to give your subscribers the option to access or delete their data, along with an option to unsubscribe from push notifications. Mark the check below for the notification preferences widget.">
                                <div className="flex items-center gap-4 p-3 rounded-md bg-background/50 border">
                                    <Label htmlFor="notification-preferences">Enable notification preferences</Label>
                                    <Switch id="notification-preferences" checked={enablePreferences} onCheckedChange={setEnablePreferences} />
                                </div>
                                {!enablePreferences && (
                                    <WarningAlert>
                                        Your subscribers will not be shown the notification preferences widget.
                                    </WarningAlert>
                                )}
                            </SettingsSection>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader><CardTitle>Store subscriber information</CardTitle></CardHeader>
                        <CardContent>
                            <SettingsSection title="EMAIL" description="Email of the subscriber is used by some third-party integrations to send push notification.">
                                 <RadioGroup value={emailStoreOption} onValueChange={setEmailStoreOption} className="space-y-2">
                                    <div className="p-3 rounded-md bg-background/50 border space-y-2">
                                        <div className="flex items-center gap-3"><RadioGroupItem value="full-email" id="full-email" /><Label htmlFor="full-email">Full Email <Info className="inline-block ml-2 h-4 w-4 text-yellow-500" /></Label></div>
                                        <div className="flex items-center gap-3"><RadioGroupItem value="hash-email" id="hash-email" /><Label htmlFor="hash-email">Hash</Label></div>
                                        <div className="flex items-center gap-3"><RadioGroupItem value="no-email" id="no-email" /><Label htmlFor="no-email">Don&apos;t store</Label></div>
                                    </div>
                                     {emailStoreOption === 'no-email' && (
                                        <WarningAlert>
                                            Some 3rd party app integrations will not work, since they rely on email IDs to send web push notification.
                                        </WarningAlert>
                                    )}
                                </RadioGroup>
                            </SettingsSection>
                            <Separator className="my-6" />
                             <SettingsSection title="LOCATION" description="Location of the subscriber is used for user segmentation based on location.">
                                <RadioGroup value={locationStoreOption} onValueChange={setLocationStoreOption} className="space-y-2">
                                    <div className="p-3 rounded-md bg-background/50 border space-y-2">
                                        <div className="flex items-center gap-3"><RadioGroupItem value="yes" id="loc-yes" /><Label htmlFor="loc-yes">Yes <Info className="inline-block ml-2 h-4 w-4 text-yellow-500" /></Label></div>
                                        <div className="flex items-center gap-3"><RadioGroupItem value="no" id="loc-no" /><Label htmlFor="loc-no">No</Label></div>
                                    </div>
                                    {locationStoreOption === 'no' && (
                                        <WarningAlert>
                                            Location of the subscriber is used for user segmentation based on location
                                        </WarningAlert>
                                    )}
                                </RadioGroup>
                            </SettingsSection>
                            <Separator className="my-6" />
                            <SettingsSection title="NAME" description="Name of the subscriber is used by placeholders in notification like {{customer_first_name}}">
                                 <RadioGroup value={nameStoreOption} onValueChange={setNameStoreOption} className="space-y-2">
                                     <div className="p-3 rounded-md bg-background/50 border space-y-2">
                                        <div className="flex items-center gap-3"><RadioGroupItem value="yes" id="name-yes" /><Label htmlFor="name-yes">Yes <Info className="inline-block ml-2 h-4 w-4 text-yellow-500" /></Label></div>
                                        <div className="flex items-center gap-3"><RadioGroupItem value="no" id="name-no" /><Label htmlFor="name-no">No</Label></div>
                                    </div>
                                     {nameStoreOption === 'no' && (
                                        <WarningAlert>
                                            Notification placeholders like {'{{customer_first_name}}'} will not work
                                        </WarningAlert>
                                    )}
                                </RadioGroup>
                            </SettingsSection>
                        </CardContent>
                    </Card>
                </div>
            </TabsContent>
            <TabsContent value="attribution">
                <Card className="mt-4">
                    <CardHeader>
                        <CardTitle>Attribution</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="max-w-xs space-y-2">
                            <Label>Attribution Model</Label>
                            <Select value={attributionModel} onValueChange={(value) => setAttributionModel(value as 'click' | 'impression')}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select attribution model" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="impression">By Impression</SelectItem>
                                    <SelectItem value="click">By Clicks</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
                            <div className="space-y-2">
                                <Label htmlFor="click-window-days">Click Window (days)</Label>
                                <Input
                                  id="click-window-days"
                                  type="number"
                                  min={1}
                                  max={30}
                                  value={clickWindowDays}
                                  onChange={(e) => setClickWindowDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="impression-window-days">Impression Window (days)</Label>
                                <Input
                                  id="impression-window-days"
                                  type="number"
                                  min={1}
                                  max={30}
                                  value={impressionWindowDays}
                                  onChange={(e) =>
                                    setImpressionWindowDays(Math.min(30, Math.max(1, Number(e.target.value) || 1)))
                                  }
                                />
                            </div>
                        </div>
                        <div>
                          <Button onClick={saveAttributionSettings}>Save Attribution Settings</Button>
                        </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
        <ImageEditorSheet 
            editingState={editingState} 
            setEditingState={setEditingState} 
            onSave={handleSaveCrop}
        />
      </div>
    </div>
  );
}
