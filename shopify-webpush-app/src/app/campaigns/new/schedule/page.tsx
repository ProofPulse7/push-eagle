'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { useCampaignState } from '@/context/campaign-context';
import { useSettings } from '@/context/settings-context';
import { buildAudienceSegmentsFromCache, bumpDashboardCampaignSent, patchOptimisticCampaign, prependOptimisticCampaign, replaceOptimisticCampaignId } from '@/lib/client/optimistic-campaigns';
import { clearCampaignDraft } from '@/lib/client/campaign-draft-storage';
import { runWithBackgroundRetries } from '@/lib/client/background-save';
import { cacheLaunchMedia } from '@/lib/client/campaign-launch-media-cache';
import { queryKeys } from '@/lib/client/query-keys';
import { OS_PREVIEW_LOGOS, type PreviewDevice } from '@/lib/client/preview-assets';

import { ArrowLeft, Users, Clock, Send, Save, Loader2, Edit } from 'lucide-react';
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

const sanitizeMediaUrl = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
        return null;
    }

    return trimmed;
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read image blob.'));
    reader.readAsDataURL(blob);
});

const resolveCampaignMediaUrl = async (sourceUrl: string | null | undefined, shopDomain: string): Promise<string | null> => {
    const direct = sanitizeMediaUrl(sourceUrl);
    if (direct) {
        return direct;
    }

    const value = sourceUrl?.trim();
    if (!value) {
        return null;
    }

    let dataUrl = value;
    if (value.startsWith('blob:')) {
        const response = await fetch(value);
        const blob = await response.blob();
        dataUrl = await blobToDataUrl(blob);
    }

    if (!dataUrl.startsWith('data:image/')) {
        return null;
    }

    const uploadResponse = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopDomain, dataUrl }),
    });

    const uploadPayload = await parseApiResponse(uploadResponse);
    if (!uploadResponse.ok || !uploadPayload.json?.ok || !uploadPayload.json?.asset?.url) {
        throw new Error(buildResponseError('Failed to upload campaign image.', uploadPayload));
    }

    return String(uploadPayload.json.asset.url);
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
    } = useCampaignState();
    const [isSaving, setIsSaving] = useState(false);
    const [isLaunching, setIsLaunching] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<PreviewDevice>('windows');
    const [segmentDisplayName, setSegmentDisplayName] = useState('All Subscribers');
    const [segmentSubscriberCount, setSegmentSubscriberCount] = useState(0);

    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { shopDomain: settingsShop } = useSettings();
    const [queryShop, setQueryShop] = useState('');
    const shopDomain = queryShop || settingsShop || '';
    const scheduledAt = buildScheduledAt(scheduledDate, scheduledTime);

    const editorHref = queryShop
        ? `/campaigns/new/editor?shop=${encodeURIComponent(queryShop)}`
        : '/campaigns/new/editor';
    const detailsHref = queryShop
        ? `/campaigns/new/details?shop=${encodeURIComponent(queryShop)}`
        : '/campaigns/new/details';
    const campaignsHref = queryShop
        ? `/campaigns?shop=${encodeURIComponent(queryShop)}`
        : '/campaigns';

    useEffect(() => {
        setQueryShop(new URLSearchParams(window.location.search).get('shop') || '');
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
    
    const handleLaunchCampaign = async () => {
        setIsLaunching(true);
        try {
            if (!shopDomain) {
                throw new Error('Open Push Eagle from Shopify Admin before launching campaigns.');
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

            const optimisticId = crypto.randomUUID();
            const launchStatus =
                sendingOption === 'schedule' || sendingOption === 'recurring' ? 'scheduled' : 'sending';

            const cachedMedia = await cacheLaunchMedia(shopDomain, optimisticId, {
                imageUrl: macHero.preview ?? windowsHero.preview ?? androidHero.preview,
                windowsImageUrl: windowsHero.preview,
                macosImageUrl: macHero.preview,
                androidImageUrl: androidHero.preview,
                iconUrl: logo.preview,
            });

            prependOptimisticCampaign(queryClient, shopDomain, {
                id: optimisticId,
                title: title || 'Untitled Campaign',
                body: message || '',
                image_url: cachedMedia.imageUrl,
                windows_image_url: cachedMedia.windowsImageUrl,
                macos_image_url: cachedMedia.macosImageUrl,
                android_image_url: cachedMedia.androidImageUrl,
                icon_url: cachedMedia.iconUrl,
                segment_id: segmentId,
                status: launchStatus,
                created_at: new Date().toISOString(),
                sent_at: launchStatus === 'sending' ? new Date().toISOString() : null,
                scheduled_at: sendingOption === 'schedule' ? scheduledAt?.toISOString() ?? null : null,
                delivery_count: 0,
                target_recipient_count: segmentSubscriberCount,
                click_count: 0,
                revenue_cents: 0,
            });

            const toastTitle =
                sendingOption === 'schedule'
                    ? 'Campaign Scheduled!'
                    : sendingOption === 'recurring'
                      ? 'Recurring Campaign Set!'
                      : 'Campaign Launched!';
            const toastDescription =
                sendingOption === 'schedule'
                    ? 'Your campaign has been scheduled.'
                    : sendingOption === 'recurring'
                      ? 'Your recurring campaign has been configured.'
                      : 'Your campaign is being delivered in the background.';

            if (launchStatus === 'sending') {
                bumpDashboardCampaignSent(queryClient, shopDomain);

                const launchResponse = await runWithBackgroundRetries(() =>
                    fetch('/api/campaigns/launch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            shopDomain,
                            title: title || 'Untitled Campaign',
                            body: message || ' ',
                            targetUrl: primaryLink || '',
                            segmentId,
                            media: cachedMedia,
                            actionButtons: actionButtons
                                .filter((button) => button.title?.trim() && button.link?.trim())
                                .map((button) => ({ title: button.title.trim(), link: button.link.trim() })),
                            maxBatches: 2000,
                        }),
                    }),
                );

                const launchResultPayload = await parseApiResponse(launchResponse);
                const launchResult = launchResultPayload.json;
                if (!launchResponse.ok || !launchResult?.ok || !launchResult?.campaignId) {
                    queryClient.setQueryData(queryKeys.campaigns(shopDomain), (current) => {
                        if (!current || !Array.isArray(current.campaigns)) {
                            return current;
                        }

                        return {
                            ...current,
                            campaigns: current.campaigns.filter(
                                (campaign) => String((campaign as { id?: string }).id) !== optimisticId,
                            ),
                        };
                    });
                    throw new Error(buildResponseError('Failed to launch campaign.', launchResultPayload));
                }

                const campaignId = String(launchResult.campaignId);
                const resolvedTargetCount = Number(
                    launchResult.recipientCount
                        ?? launchResult.targetRecipientCount
                        ?? segmentSubscriberCount
                        ?? 0,
                );

                replaceOptimisticCampaignId(queryClient, shopDomain, optimisticId, {
                    id: campaignId,
                    title: title || 'Untitled Campaign',
                    body: message || '',
                    image_url: cachedMedia.imageUrl,
                    windows_image_url: cachedMedia.windowsImageUrl,
                    macos_image_url: cachedMedia.macosImageUrl,
                    android_image_url: cachedMedia.androidImageUrl,
                    icon_url: cachedMedia.iconUrl,
                    segment_id: segmentId,
                    status: 'sending',
                    created_at: new Date().toISOString(),
                    sent_at: new Date().toISOString(),
                    delivery_count: 0,
                    target_recipient_count: resolvedTargetCount,
                    click_count: 0,
                    revenue_cents: 0,
                });

                void cacheLaunchMedia(shopDomain, campaignId, cachedMedia);
                clearCampaignDraft(shopDomain);

                toast({
                    title: toastTitle,
                    description: toastDescription,
                });
                router.push(campaignsHref);
                return;
            }

            toast({
                title: toastTitle,
                description: toastDescription,
            });
            router.push(campaignsHref);
            clearCampaignDraft(shopDomain);

            void (async () => {
                let campaignId: string | null = null;
                try {
                    const [iconUrl, windowsImageUrl, macosImageUrl, androidImageUrl] = await Promise.all([
                        resolveCampaignMediaUrl(logo.preview, shopDomain),
                        resolveCampaignMediaUrl(windowsHero.preview, shopDomain),
                        resolveCampaignMediaUrl(macHero.preview, shopDomain),
                        resolveCampaignMediaUrl(androidHero.preview, shopDomain),
                    ]);

                    const createResponse = await runWithBackgroundRetries(() =>
                        fetch('/api/campaigns', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            keepalive: true,
                            body: JSON.stringify({
                                shopDomain,
                                title: title || 'Untitled Campaign',
                                body: message || ' ',
                                targetUrl: primaryLink || null,
                                iconUrl,
                                imageUrl: macosImageUrl,
                                windowsImageUrl,
                                macosImageUrl,
                                androidImageUrl,
                                actionButtons: actionButtons
                                    .filter((button) => button.title?.trim() && button.link?.trim())
                                    .map((button) => ({ title: button.title.trim(), link: button.link.trim() })),
                                segmentId,
                                status: sendingOption === 'schedule' ? 'scheduled' : 'draft',
                                scheduledAt: sendingOption === 'schedule' ? scheduledAt?.toISOString() ?? null : null,
                                smartDeliver,
                                flashSaleEnabled,
                                flashSaleConfig: flashSaleEnabled ? {
                                    discountPercent: flashSaleDiscountPercent,
                                    originalPrice: flashSaleOriginalPrice,
                                    salePrice: flashSaleSalePrice,
                                    expiresAt: flashSaleExpiresAt?.toISOString(),
                                    urgencyText: flashSaleUrgencyText,
                                } : undefined,
                                recurringPattern: sendingOption === 'recurring' ? recurringPattern : undefined,
                            }),
                        }),
                    );

                    const createPayload = await parseApiResponse(createResponse);
                    const createResult = createPayload.json;
                    if (!createResponse.ok || !createResult?.ok || !createResult?.campaign?.id) {
                        throw new Error(buildResponseError('Failed to create campaign.', createPayload));
                    }

                    campaignId = String(createResult.campaign.id);

                    replaceOptimisticCampaignId(queryClient, shopDomain, optimisticId, {
                        id: campaignId,
                        title: title || 'Untitled Campaign',
                        body: message || '',
                        image_url: macosImageUrl ?? windowsImageUrl ?? androidImageUrl ?? cachedMedia.imageUrl,
                        windows_image_url: windowsImageUrl ?? cachedMedia.windowsImageUrl,
                        macos_image_url: macosImageUrl ?? cachedMedia.macosImageUrl,
                        android_image_url: androidImageUrl ?? cachedMedia.androidImageUrl,
                        icon_url: iconUrl ?? cachedMedia.iconUrl,
                        segment_id: segmentId,
                        status: launchStatus,
                        created_at: new Date().toISOString(),
                        sent_at: launchStatus === 'sending' ? new Date().toISOString() : null,
                        scheduled_at: sendingOption === 'schedule' ? scheduledAt?.toISOString() ?? null : null,
                        delivery_count: 0,
                        target_recipient_count: segmentSubscriberCount,
                        click_count: 0,
                        revenue_cents: 0,
                    });

                    if (sendingOption === 'schedule' || sendingOption === 'recurring') {
                        if (sendingOption === 'schedule') {
                            if (!scheduledAt) {
                                throw new Error('Choose a valid scheduled date and time.');
                            }

                            if (scheduledAt.getTime() <= Date.now()) {
                                throw new Error('Scheduled time must be in the future.');
                            }
                        }

                        if (sendingOption === 'recurring' && !recurringPattern) {
                            throw new Error('Choose a recurring pattern.');
                        }

                        const scheduleResponse = await fetch('/api/campaigns/schedule', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
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
                        const scheduleResult = schedulePayload.json;
                        if (!scheduleResponse.ok || !scheduleResult?.ok) {
                            throw new Error(buildResponseError('Failed to schedule campaign.', schedulePayload));
                        }
                        return;
                    }
                } catch (backgroundError) {
                    if (campaignId) {
                        patchOptimisticCampaign(queryClient, shopDomain, campaignId, {
                            status: 'sending',
                        });
                    }
                    toast({
                        variant: 'destructive',
                        title: 'Campaign delivery issue',
                        description:
                            backgroundError instanceof Error
                                ? backgroundError.message
                                : 'Background delivery failed. Retrying automatically — check campaigns for status.',
                    });
                }
            })();
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
                throw new Error('Open Push Eagle from Shopify Admin before saving drafts.');
            }

            const [iconUrl, windowsImageUrl, macosImageUrl, androidImageUrl] = await Promise.all([
                resolveCampaignMediaUrl(logo.preview, shopDomain),
                resolveCampaignMediaUrl(windowsHero.preview, shopDomain),
                resolveCampaignMediaUrl(macHero.preview, shopDomain),
                resolveCampaignMediaUrl(androidHero.preview, shopDomain),
            ]);

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
                    iconUrl,
                    imageUrl: macosImageUrl,
                    windowsImageUrl,
                    macosImageUrl,
                    androidImageUrl,
                    actionButtons: actionButtons
                        .filter((button) => button.title?.trim() && button.link?.trim())
                        .map((button) => ({ title: button.title.trim(), link: button.link.trim() })),
                    segmentId,
                    status: 'draft',
                }),
            });

            const payload = await parseApiResponse(response);
            const result = payload.json;
            if (!response.ok || !result?.ok) {
                throw new Error(buildResponseError('Failed to save draft.', payload));
            }

            toast({
                title: "Draft Saved!",
                description: "Your campaign has been saved as a draft.",
            });
            router.push(campaignsHref);
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
                <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isSaving ? 'Saving...' : 'Save as Draft'}
                </Button>
                <Button 
                    size="lg" 
                    onClick={handleLaunchCampaign} 
                    disabled={isSaving || isLaunching || !title || !primaryLink}
                >
                    {isLaunching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {isLaunching
                        ? 'Launching...'
                        : sendingOption === 'schedule'
                          ? 'Schedule Campaign'
                          : 'Launch Campaign'}
                </Button>
            </div>
        </div>
    );
}
