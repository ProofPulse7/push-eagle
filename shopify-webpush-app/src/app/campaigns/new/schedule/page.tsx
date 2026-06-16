'use client';
import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useCampaignState } from '@/context/campaign-context';
import { useSettings } from '@/context/settings-context';
import {
    buildAudienceSegmentsFromCache,
    bumpDashboardCampaignSent,
    markOptimisticCampaignAsDraft,
    prependOptimisticCampaign,
    replaceOptimisticCampaignId,
    updateOptimisticCampaign,
} from '@/lib/client/optimistic-campaigns';
import { persistCampaignRecord, sendCampaignNow, refreshCampaignQueries } from '@/lib/client/campaign-persist';
import { buildWizardPath, clearWizardSession, readWizardQueryParams } from '@/lib/client/campaign-wizard-bridge';
import { OS_PREVIEW_LOGOS, type PreviewDevice } from '@/lib/client/preview-assets';

import { ArrowLeft, Users, Clock, Send, Save, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

import { IOSPreview } from '@/components/composer/previews/ios-preview';
import { AndroidPreview } from '@/components/composer/previews/android-preview';
import { WindowsPreview } from '@/components/composer/previews/windows-preview';
import { MacOSPreview } from '@/components/composer/previews/macos-preview';

const buildScheduledAt = (scheduledDate?: Date, scheduledTime?: string) => {
    if (!scheduledDate || !scheduledTime) {
        return null;
    }

    const match = scheduledTime.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)$/i);
    if (!match) {
        return null;
    }

    const [, hourValue, minuteValue, meridiem] = match;
    let hours = Number(hourValue) % 12;
    if (meridiem.toUpperCase() === 'PM') {
        hours += 12;
    }

    const result = new Date(scheduledDate);
    result.setHours(hours, Number(minuteValue), 0, 0);
    return result;
};

const parseApiResponse = async (response: Response): Promise<{ json: any | null; text: string }> => {
    const text = await response.text();

    if (!text) {
        return { json: null, text: '' };
    }

    try {
        return { json: JSON.parse(text), text };
    } catch {
        return { json: null, text };
    }
};

const buildResponseError = (fallback: string, payload: { json: any | null; text: string }) => {
    const jsonError = payload.json && typeof payload.json === 'object' ? payload.json.error : null;
    if (typeof jsonError === 'string' && jsonError.trim()) {
        return jsonError;
    }

    if (payload.text) {
        return `${fallback} ${payload.text.slice(0, 180)}`;
    }

    return fallback;
};


export default function ScheduleCampaignPage() {
    const {
        title,
        message,
        primaryLink,
        windowsHero,
        macHero,
        androidHero,
        logo,
        actionButtons,
        sendingOption,
        scheduledDate,
        scheduledTime,
        segmentId,
        // Smart Delivery
        smartDeliver,
        // Flash Sale
        flashSaleEnabled,
        flashSaleDiscountPercent,
        flashSaleOriginalPrice,
        flashSaleSalePrice,
        flashSaleExpiresAt,
        flashSaleUrgencyText,
        // Recurring
        recurringPattern,
        setRecurringPattern,
        editingCampaignId,
        setEditingCampaignId,
        resetWizard,
    } = useCampaignState();
    const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('windows');
    const [segmentDisplayName, setSegmentDisplayName] = useState('All Subscribers');
    const [segmentSubscriberCount, setSegmentSubscriberCount] = useState(0);
    const [wizardQuery, setWizardQuery] = useState({ shop: '', draftId: '', duplicateId: '' });

    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { shopDomain: settingsShop } = useSettings();
    const shopDomain = wizardQuery.shop || settingsShop || '';
    const scheduledAt = buildScheduledAt(scheduledDate, scheduledTime);

    const wizardOptions = useMemo(
        () => ({
            draft: wizardQuery.draftId || undefined,
            duplicate: wizardQuery.duplicateId || undefined,
        }),
        [wizardQuery.draftId, wizardQuery.duplicateId],
    );

    const editorHref = buildWizardPath('/campaigns/new/editor', shopDomain, wizardOptions);
    const detailsHref = buildWizardPath('/campaigns/new/details', shopDomain, wizardOptions);
    const campaignsHref = shopDomain
        ? `/campaigns?shop=${encodeURIComponent(shopDomain)}`
        : '/campaigns';

    useEffect(() => {
        setWizardQuery(readWizardQueryParams());
    }, []);

    useEffect(() => {
        if (!shopDomain) {
            return;
        }

        const cachedSegments = buildAudienceSegmentsFromCache(queryClient, shopDomain);
        const selected = cachedSegments.find((segment) => segment.id === segmentId) ?? cachedSegments[0];
        if (selected) {
            setSegmentDisplayName(selected.name);
            setSegmentSubscriberCount(selected.count);
        }

        let active = true;
        fetch(`/api/campaigns/audience?shop=${encodeURIComponent(shopDomain)}`)
            .then((response) => response.json())
            .then((data) => {
                if (!active || !data?.ok || !Array.isArray(data.segments)) {
                    return;
                }

                const refreshed = data.segments.find((segment: { id: string }) => segment.id === segmentId) ?? data.segments[0];
                if (!refreshed) {
                    return;
                }

                setSegmentDisplayName(String(refreshed.name ?? 'All Subscribers'));
                setSegmentSubscriberCount(Number(refreshed.count ?? 0));
            })
            .catch(() => undefined);

        return () => {
            active = false;
        };
    }, [queryClient, shopDomain, segmentId]);

    const buildOptimisticRecord = (id: string, status: string, media?: {
        iconUrl?: string | null;
        windowsImageUrl?: string | null;
        macosImageUrl?: string | null;
        androidImageUrl?: string | null;
    }) => ({
        id,
        title: title || 'Untitled Campaign',
        body: message || '',
        image_url: media?.macosImageUrl ?? media?.windowsImageUrl ?? media?.androidImageUrl ?? macHero.preview ?? windowsHero.preview ?? androidHero.preview,
        windows_image_url: media?.windowsImageUrl ?? windowsHero.preview,
        macos_image_url: media?.macosImageUrl ?? macHero.preview,
        android_image_url: media?.androidImageUrl ?? androidHero.preview,
        icon_url: media?.iconUrl ?? logo.preview,
        segment_id: segmentId || 'all',
        status,
        created_at: new Date().toISOString(),
        sent_at: status === 'sending' || status === 'sent' ? new Date().toISOString() : null,
        scheduled_at: sendingOption === 'schedule' ? scheduledAt?.toISOString() ?? null : null,
        delivery_count: segmentSubscriberCount,
        click_count: 0,
        revenue_cents: 0,
    });

    const handleLaunchCampaign = () => {
        try {
            if (!shopDomain) {
                throw new Error('Set your Shopify subdomain in Settings before launching campaigns.');
            }

            if (!title?.trim()) {
                throw new Error('Campaign title is required.');
            }

            if (!primaryLink?.trim()) {
                throw new Error('Destination URL is required.');
            }

            if (sendingOption === 'schedule') {
                if (!scheduledAt) {
                    throw new Error('Choose a valid scheduled date and time.');
                }

                if (scheduledAt.getTime() <= Date.now()) {
                    throw new Error('Scheduled time must be in the future.');
                }
            }

            const launchStatus =
                sendingOption === 'schedule' || sendingOption === 'recurring' ? 'scheduled' : 'sending';
            const optimisticId = editingCampaignId || crypto.randomUUID();
            const optimisticRecord = buildOptimisticRecord(optimisticId, launchStatus);

            if (editingCampaignId) {
                updateOptimisticCampaign(queryClient, shopDomain, editingCampaignId, optimisticRecord);
            } else {
                prependOptimisticCampaign(queryClient, shopDomain, optimisticRecord);
            }

            if (launchStatus === 'sending') {
                bumpDashboardCampaignSent(queryClient, shopDomain);
            }

            toast({
                title:
                    sendingOption === 'schedule'
                        ? 'Campaign Scheduled!'
                        : sendingOption === 'recurring'
                          ? 'Recurring Campaign Set!'
                          : 'Campaign Launched!',
                description:
                    sendingOption === 'schedule'
                        ? 'Your campaign has been scheduled.'
                        : sendingOption === 'recurring'
                          ? 'Your recurring campaign has been configured.'
                          : 'Your campaign is being delivered in the background.',
            });
            router.push(campaignsHref);

            void (async () => {
                let campaignId = optimisticId;
                try {
                    campaignId = await persistCampaignRecord({
                        shopDomain,
                        editingCampaignId,
                        title,
                        message,
                        primaryLink,
                        segmentId: segmentId || 'all',
                        actionButtons,
                        logoPreview: logo.preview,
                        windowsHeroPreview: windowsHero.preview,
                        macHeroPreview: macHero.preview,
                        androidHeroPreview: androidHero.preview,
                        status: sendingOption === 'schedule' ? 'scheduled' : 'draft',
                        scheduledAt: sendingOption === 'schedule' ? scheduledAt?.toISOString() ?? null : null,
                    });

                    if (!editingCampaignId) {
                        replaceOptimisticCampaignId(queryClient, shopDomain, optimisticId, buildOptimisticRecord(campaignId, launchStatus));
                    } else {
                        updateOptimisticCampaign(queryClient, shopDomain, campaignId, buildOptimisticRecord(campaignId, launchStatus));
                    }

                    if (sendingOption === 'schedule' || sendingOption === 'recurring') {
                        if (sendingOption === 'recurring' && !recurringPattern) {
                            throw new Error('Choose a recurring pattern.');
                        }

                        const scheduleResponse = await fetch('/api/campaigns/schedule', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                campaignId,
                                shopDomain,
                                scheduleType: sendingOption,
                                sendAt: sendingOption === 'schedule' ? scheduledAt?.toISOString() : undefined,
                                recurringPattern: sendingOption === 'recurring' ? recurringPattern : undefined,
                                smartSendEnabled: smartDeliver,
                                flashSaleEnabled,
                                flashSaleConfig: flashSaleEnabled
                                    ? {
                                          discountPercent: flashSaleDiscountPercent,
                                          originalPrice: flashSaleOriginalPrice,
                                          salePrice: flashSaleSalePrice,
                                          expiresAt: flashSaleExpiresAt?.toISOString(),
                                          urgencyText: flashSaleUrgencyText,
                                      }
                                    : undefined,
                            }),
                        });

                        const schedulePayload = await parseApiResponse(scheduleResponse);
                        if (!scheduleResponse.ok || !schedulePayload.json?.ok) {
                            throw new Error(buildResponseError('Failed to schedule campaign.', schedulePayload));
                        }

                        clearWizardSession(shopDomain);
                        resetWizard();
                        refreshCampaignQueries(queryClient, shopDomain);
                        return;
                    }

                    const sendResult = await sendCampaignNow(shopDomain, campaignId);
                    const deliveredCount = Number(sendResult.recipientCount ?? sendResult.successCount ?? segmentSubscriberCount);

                    updateOptimisticCampaign(queryClient, shopDomain, campaignId, {
                        status: 'sent',
                        sent_at: new Date().toISOString(),
                        delivery_count: deliveredCount,
                    });

                    clearWizardSession(shopDomain);
                    resetWizard();
                    refreshCampaignQueries(queryClient, shopDomain);
                } catch (backgroundError) {
                    markOptimisticCampaignAsDraft(queryClient, shopDomain, campaignId);
                    refreshCampaignQueries(queryClient, shopDomain);
                    toast({
                        variant: 'destructive',
                        title: 'Campaign delivery issue',
                        description:
                            backgroundError instanceof Error
                                ? backgroundError.message
                                : 'Campaign moved back to drafts. Try launching again.',
                    });
                }
            })();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Campaign launch failed',
                description: error instanceof Error ? error.message : 'Unexpected error while launching campaign.',
            });
        }
    };

    const handleSaveDraft = () => {
        try {
            if (!shopDomain) {
                throw new Error('Set your Shopify subdomain in Settings before saving drafts.');
            }

            const optimisticId = editingCampaignId || crypto.randomUUID();
            const draftRecord = buildOptimisticRecord(optimisticId, 'draft');

            if (editingCampaignId) {
                updateOptimisticCampaign(queryClient, shopDomain, editingCampaignId, draftRecord);
            } else {
                prependOptimisticCampaign(queryClient, shopDomain, draftRecord);
            }

            toast({
                title: 'Draft Saved!',
                description: 'Your campaign has been saved as a draft.',
            });
            router.push(`${campaignsHref}${campaignsHref.includes('?') ? '&' : '?'}tab=draft`);

            void (async () => {
                try {
                    const savedId = await persistCampaignRecord({
                        shopDomain,
                        editingCampaignId,
                        title,
                        message,
                        primaryLink,
                        segmentId: segmentId || 'all',
                        actionButtons,
                        logoPreview: logo.preview,
                        windowsHeroPreview: windowsHero.preview,
                        macHeroPreview: macHero.preview,
                        androidHeroPreview: androidHero.preview,
                        status: 'draft',
                        scheduledAt: null,
                    });

                    if (!editingCampaignId) {
                        replaceOptimisticCampaignId(queryClient, shopDomain, optimisticId, buildOptimisticRecord(savedId, 'draft'));
                    }

                    setEditingCampaignId(savedId);
                    refreshCampaignQueries(queryClient, shopDomain);
                } catch (backgroundError) {
                    if (!editingCampaignId) {
                        markOptimisticCampaignAsDraft(queryClient, shopDomain, optimisticId);
                    }
                    toast({
                        variant: 'destructive',
                        title: 'Draft save failed',
                        description:
                            backgroundError instanceof Error
                                ? backgroundError.message
                                : 'Could not save draft in the background.',
                    });
                }
            })();
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Draft save failed',
                description: error instanceof Error ? error.message : 'Unexpected error while saving draft.',
            });
        }
    };

    const renderPreview = () => {
        switch (previewDevice) {
            case 'windows':
                return <WindowsPreview title={title} message={message} link={primaryLink} icon={logo.preview} hero={windowsHero.preview} actionButtons={actionButtons} showDeviceName={false} />;
            case 'macos':
                 return <MacOSPreview title={title} message={message} link={primaryLink} icon={logo.preview} hero={macHero.preview} actionButtons={actionButtons} showDeviceName={false} />;
            case 'android':
                return <AndroidPreview title={title} message={message} link={primaryLink} icon={logo.preview} hero={androidHero.preview} actionButtons={actionButtons} showDeviceName={false} />;
            case 'ios':
                return <IOSPreview title={title} message={message} link={primaryLink} icon={logo.preview} showDeviceName={false} />;
            default:
                return <WindowsPreview title={title} message={message} link={primaryLink} icon={logo.preview} hero={windowsHero.preview} actionButtons={actionButtons} showDeviceName={false} />;
        }
    }
    
    return (
        <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8 bg-muted/40 min-h-screen">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" asChild>
                    <Link href={editorHref}>
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
                                <Link href={detailsHref}><Edit className="mr-2 h-3 w-3" /> Edit</Link>
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Campaign type</p>
                                <p className="font-medium">Regular campaign</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Campaign gets delivered to</p>
                                <p className="font-medium flex items-center gap-2"><Users className="h-4 w-4" /> {segmentDisplayName} ({segmentSubscriberCount.toLocaleString()} subscribers)</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Starts</p>
                                <p className="font-medium flex items-center gap-2">
                                    <Clock className="h-4 w-4" /> 
                                    {sendingOption === 'schedule' && scheduledAt
                                        ? format(scheduledAt, 'PPP p')
                                        : 'Immediately'}
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
                                <Link href={editorHref}><Edit className="mr-2 h-3 w-3" /> Edit</Link>
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-4">
                               <div className="flex flex-col gap-2">
                                    {([
                                        { device: 'ios' as const, label: 'Safari on iOS' },
                                        { device: 'android' as const, label: 'Chrome on Android' },
                                        { device: 'windows' as const, label: 'Microsoft Edge on Windows' },
                                        { device: 'macos' as const, label: 'Chrome on macOS' },
                                    ]).map(({ device, label }) => (
                                        <Button
                                            key={device}
                                            variant={previewDevice === device ? 'secondary' : 'ghost'}
                                            size="icon"
                                            className="h-10 w-10 p-1"
                                            onClick={() => setPreviewDevice(device)}
                                            aria-label={label}
                                        >
                                            <Image
                                                src={OS_PREVIEW_LOGOS[device]}
                                                alt={label}
                                                width={24}
                                                height={24}
                                                className="h-6 w-6 object-contain"
                                            />
                                        </Button>
                                    ))}
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
                <Button variant="outline" onClick={handleSaveDraft} disabled={!title || !primaryLink}>
                    <Save className="mr-2 h-4 w-4" />
                    Save as Draft
                </Button>
                <Button 
                    size="lg" 
                    onClick={handleLaunchCampaign} 
                    disabled={!title || !primaryLink}
                >
                    <Send className="mr-2 h-4 w-4" />
                    {sendingOption === 'schedule' ? 'Schedule Campaign' : 'Launch Campaign'}
                </Button>
            </div>
        </div>
    );
}
