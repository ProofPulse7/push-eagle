
'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useCampaignState } from '@/context/campaign-context';
import { useSettings } from '@/context/settings-context';

import { ArrowLeft, Users, Calendar as CalendarIcon, Clock, Send, Save, Eye, Loader2, Edit, Image as ImageIcon, MessageSquare, Link as LinkIcon, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

import { IOSPreview } from '@/components/composer/previews/ios-preview';
import { AndroidPreview } from '@/components/composer/previews/android-preview';
import { WindowsPreview } from '@/components/composer/previews/windows-preview';
import { MacOSPreview } from '@/components/composer/previews/macos-preview';


export default function ScheduleCampaignPage() {
    const { title, message, primaryLink, windowsHero, macHero, androidHero, logo, actionButtons, sendingOption, segmentId } = useCampaignState();
    const [isLaunching, setIsLaunching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [previewDevice, setPreviewDevice] = useState('windows');

    const router = useRouter();
    const { toast } = useToast();
    const { shopDomain } = useSettings();
    
    const handleLaunchCampaign = async (status: 'Sent' | 'Scheduled') => {
        setIsLaunching(true);
        try {
            if (!shopDomain) {
                throw new Error('Set your Shopify subdomain in Settings before launching campaigns.');
            }

            const createResponse = await fetch('/api/campaigns', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    shopDomain,
                    title: title || 'Untitled Campaign',
                    body: message || '',
                    targetUrl: primaryLink || null,
                    iconUrl: logo.preview,
                    imageUrl: macHero.preview,
                    segmentId,
                    status: sendingOption === 'schedule' ? 'scheduled' : 'draft',
                    scheduledAt: sendingOption === 'schedule' ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null,
                }),
            });

            const createResult = await createResponse.json();
            if (!createResponse.ok || !createResult?.ok || !createResult?.campaign?.id) {
                throw new Error(createResult?.error ?? 'Failed to create campaign.');
            }

            if (sendingOption !== 'schedule') {
                const sendResponse = await fetch(`/api/campaigns/${createResult.campaign.id}/send`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ shopDomain }),
                });

                const sendResult = await sendResponse.json();
                if (!sendResponse.ok || !sendResult?.ok) {
                    throw new Error(sendResult?.error ?? 'Failed to send campaign.');
                }
            }

            const toastTitle = status === 'Sent' ? "Campaign Launched!" : "Campaign Scheduled!";
            const toastDescription = status === 'Sent' ? "Your campaign has been successfully sent." : "Your campaign has been scheduled.";
            
            toast({
                title: toastTitle,
                description: toastDescription,
            });
            router.push('/campaigns');
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Campaign launch failed',
                description: error instanceof Error ? error.message : 'Unexpected error while launching campaign.',
            });
        } finally {
            setIsLaunching(false);
        }
    };

    const handleSaveDraft = async () => {
        setIsSaving(true);
        try {
            if (!shopDomain) {
                throw new Error('Set your Shopify subdomain in Settings before saving drafts.');
            }

            const response = await fetch('/api/campaigns', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    shopDomain,
                    title: title || 'Untitled Campaign',
                    body: message || '',
                    targetUrl: primaryLink || null,
                    iconUrl: logo.preview,
                    imageUrl: macHero.preview,
                    segmentId,
                    status: 'draft',
                }),
            });

            const result = await response.json();
            if (!response.ok || !result?.ok) {
                throw new Error(result?.error ?? 'Failed to save draft.');
            }

            toast({
                title: "Draft Saved!",
                description: "Your campaign has been saved as a draft.",
            });
            router.push('/campaigns');
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Draft save failed',
                description: error instanceof Error ? error.message : 'Unexpected error while saving draft.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const renderPreview = () => {
        switch (previewDevice) {
            case 'windows':
                return <WindowsPreview title={title} message={message} link={primaryLink} hero={windowsHero.preview} actionButtons={actionButtons} showDeviceName={false} />;
            case 'macos':
                 return <MacOSPreview title={title} message={message} link={primaryLink} icon={logo.preview} hero={macHero.preview} actionButtons={actionButtons} showDeviceName={false} />;
            case 'android':
                return <AndroidPreview title={title} message={message} link={primaryLink} icon={logo.preview} hero={androidHero.preview} actionButtons={actionButtons} showDeviceName={false} />;
            case 'ios':
                return <IOSPreview title={title} message={message} link={primaryLink} icon={logo.preview} showDeviceName={false} />;
            default:
                return <WindowsPreview title={title} message={message} link={primaryLink} hero={windowsHero.preview} actionButtons={actionButtons} showDeviceName={false} />;
        }
    }
    
    return (
        <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8 bg-muted/40 min-h-screen">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href="/campaigns/new/editor">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="sr-only">Back to Composer</span>
                    </Link>
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Review Campaign</h1>
                    <p className="text-muted-foreground">Review your campaign details before sending it.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                <div className="space-y-6">
                    <Card className='flex flex-col h-full'>
                        <CardHeader className="flex flex-row justify-between items-center">
                            <CardTitle>Summary</CardTitle>
                            <Button variant="outline" size="sm" asChild>
                                <Link href="/campaigns/new/details"><Edit className="mr-2 h-3 w-3" /> Edit</Link>
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Campaign type</p>
                                <p className="font-medium">Regular campaign</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Campaign gets delivered to</p>
                                <p className="font-medium flex items-center gap-2"><Users className="h-4 w-4" /> All Subscribers (6 subscribers)</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Starts (Pakistan Standard Time)</p>
                                <p className="font-medium flex items-center gap-2">
                                    <Clock className="h-4 w-4" /> 
                                    {sendingOption === 'schedule' ? 'Scheduled for later' : 'Immediately'}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                
                <div className="space-y-6">
                    <Card className='flex flex-col h-full'>
                         <CardHeader className="flex flex-row justify-between items-center">
                            <CardTitle>Preview</CardTitle>
                            <Button variant="outline" size="sm" asChild>
                                <Link href="/campaigns/new/editor"><Edit className="mr-2 h-3 w-3" /> Edit</Link>
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-4">
                               <div className="flex flex-col gap-2">
                                    <Button variant={previewDevice === 'ios' ? 'secondary' : 'ghost'} size="icon" onClick={() => setPreviewDevice('ios')}>
                                        <ImageIcon className="w-5 h-5" />
                                    </Button>
                                    <Button variant={previewDevice === 'android' ? 'secondary' : 'ghost'} size="icon" onClick={() => setPreviewDevice('android')}>
                                        <AndroidPreviewIcon className="w-5 h-5" />
                                    </Button>
                                    <Button variant={previewDevice === 'windows' ? 'secondary' : 'ghost'} size="icon" onClick={() => setPreviewDevice('windows')}>
                                        <WindowsPreviewIcon className="w-5 h-5" />
                                    </Button>
                                    <Button variant={previewDevice === 'macos' ? 'secondary' : 'ghost'} size="icon" onClick={() => setPreviewDevice('macos')}>
                                        <MacOSPreviewIcon className="w-5 h-5" />
                                    </Button>
                               </div>
                               <div className="flex-1 p-4 bg-muted rounded-md flex items-center justify-center min-h-[200px]">
                                 {renderPreview()}
                               </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
             <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving || isLaunching}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isSaving ? 'Saving...' : 'Save as Draft'}
                </Button>
                <Button 
                    size="lg" 
                    onClick={() => handleLaunchCampaign(sendingOption === 'schedule' ? 'Scheduled' : 'Sent')} 
                    disabled={isLaunching || isSaving || !title}
                >
                    {isLaunching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {isLaunching ? 'Processing...' : (sendingOption === 'schedule' ? 'Schedule Campaign' : 'Launch Campaign')}
                </Button>
            </div>
        </div>
    );
}

// Icons for preview switching
const AndroidPreviewIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M16 8c0-2.2-1.8-4-4-4S8 5.8 8 8v4h8V8zm-2 0c0-1.1-.9-2-2-2s-2 .9-2 2v2h4V8z"/>
    <path d="M19 12H5c-1.1 0-2 .9-2 2v5h18v-5c0-1.1-.9-2-2-2zm-9 4H8v-2h2v2zm4 0h-2v-2h2v2z"/>
  </svg>
);

const WindowsPreviewIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M2 3h9v9H2V3zm11 0h9v9h-9V3zM2 12h9v9H2v-9zm11 0h9v9h-9v-9z"/>
  </svg>
);

const MacOSPreviewIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M20 12c0-2.2-1.8-4-4-4s-4 1.8-4 4 1.8 4 4 4 4-1.8 4-4zM9 12c0-2.2-1.8-4-4-4s-4 1.8-4 4 1.8 4 4 4 4-1.8 4-4zm11 7H4c-.6 0-1-.4-1-1s.4-1 1-1h16c.6 0 1 .4 1 1s-.4 1-1 1z"/>
  </svg>
);
