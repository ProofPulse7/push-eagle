'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useCampaignState, clearCampaignDraft } from '@/context/campaign-context';
import { useSettings } from '@/context/settings-context';
import { buildAudienceSegmentsFromCache, bumpDashboardCampaignSent, patchOptimisticCampaign, prependOptimisticCampaign } from '@/lib/client/optimistic-campaigns';
import { subscribeShopSync } from '@/lib/client/shop-sync-bus';
import { commitCampaignDraftSave } from '@/lib/client/campaign-save-draft';
import { cacheLaunchMedia } from '@/lib/client/campaign-launch-media-cache';
import {
  persistPendingCampaignLaunch,
  runCampaignBackgroundLaunch,
  type CampaignLaunchPayload,
} from '@/lib/client/campaign-background-launch';
import {
  readWizardLaunchMediaCache,
  buildMergedLaunchMedia,
} from '@/lib/client/campaign-wizard-media';
import { buildCampaignDateTime, formatCampaignScheduleLabel } from '@/lib/client/campaign-schedule';
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
        flashSaleExpiresTime,
        flashSaleUrgencyText,
        draftCampaignId,
    } = useCampaignState();
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
    const scheduledAt = buildCampaignDateTime(scheduledDate, scheduledTime);
    const flashSaleEndsAt = buildCampaignDateTime(flashSaleExpiresAt, flashSaleExpiresTime);

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

        const unsubscribe = subscribeShopSync(shopDomain, (event) => {
            if (event.type !== 'subscribers' && event.type !== 'all') {
                return;
            }

            const refreshedSegments = buildAudienceSegmentsFromCache(queryClient, shopDomain);
            const refreshedSelected =
                refreshedSegments.find((segment) => segment.id === segmentId) ?? refreshedSegments[0];
            if (refreshedSelected) {
                setSegmentDisplayName(refreshedSelected.name);
                setSegmentSubscriberCount(refreshedSelected.count);
            }
        });

        return () => {
            active = false;
            unsubscribe();
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

            if (flashSaleEnabled) {
                if (!flashSaleEndsAt) {
                    throw new Error('Choose a valid flash sale expiry date and time.');
                }

                if (flashSaleEndsAt.getTime() <= Date.now()) {
                    throw new Error('Flash sale expiry must be in the future.');
                }
            }

            const isScheduled = sendingOption === 'schedule';
            const launchStatus = isScheduled ? 'scheduled' : 'queued';
            const launchingExistingDraft = Boolean(draftCampaignId);
            const optimisticId = draftCampaignId ?? crypto.randomUUID();

            const deliveryPayload = {
                sendingOption: isScheduled ? 'schedule' as const : 'now' as const,
                scheduledAt: isScheduled ? scheduledAt?.toISOString() ?? null : null,
                smartDeliver,
                flashSaleEnabled,
                flashSaleConfig: flashSaleEnabled
                    ? {
                          discountPercent: flashSaleDiscountPercent,
                          originalPrice: flashSaleOriginalPrice,
                          salePrice: flashSaleSalePrice,
                          expiresAt: flashSaleEndsAt?.toISOString() ?? null,
                          urgencyText: flashSaleUrgencyText,
                      }
                    : null,
            };

            const launchMedia = buildMergedLaunchMedia(readWizardLaunchMediaCache(shopDomain), {
                imageUrl: macHero.preview ?? windowsHero.preview ?? androidHero.preview,
                windowsImageUrl: windowsHero.preview,
                macosImageUrl: macHero.preview,
                androidImageUrl: androidHero.preview,
                iconUrl: logo.preview,
            });

            const displayMedia = {
                imageUrl: launchMedia.imageUrl ?? macHero.preview ?? windowsHero.preview ?? androidHero.preview,
                windowsImageUrl: launchMedia.windowsImageUrl ?? windowsHero.preview,
                macosImageUrl: launchMedia.macosImageUrl ?? macHero.preview,
                androidImageUrl: launchMedia.androidImageUrl ?? androidHero.preview,
                iconUrl: launchMedia.iconUrl ?? logo.preview,
            };

            const optimisticCampaign = {
                id: optimisticId,
                title: title || 'Untitled Campaign',
                body: message || '',
                image_url: displayMedia.imageUrl,
                windows_image_url: displayMedia.windowsImageUrl,
                macos_image_url: displayMedia.macosImageUrl,
                android_image_url: displayMedia.androidImageUrl,
                icon_url: displayMedia.iconUrl,
                segment_id: segmentId,
                status: launchStatus,
                created_at: new Date().toISOString(),
                sent_at: launchStatus === 'queued' ? new Date().toISOString() : null,
                scheduled_at: sendingOption === 'schedule' ? scheduledAt?.toISOString() ?? null : null,
                delivery_count: 0,
                target_recipient_count: segmentSubscriberCount,
                click_count: 0,
                revenue_cents: 0,
            };

            if (launchingExistingDraft) {
                patchOptimisticCampaign(queryClient, shopDomain, optimisticId, optimisticCampaign);
            } else {
                prependOptimisticCampaign(queryClient, shopDomain, optimisticCampaign);
            }

            if (launchStatus === 'queued') {
                bumpDashboardCampaignSent(queryClient, shopDomain);
            }

            const toastTitle = isScheduled ? 'Campaign Scheduled!' : 'Campaign Launched!';
            const toastDescription = isScheduled
                ? 'Your campaign has been scheduled.'
                : smartDeliver
                  ? 'Your campaign is queued with smart delivery.'
                  : 'Your campaign is queued. Notifications send in the background.';

            toast({
                title: toastTitle,
                description: toastDescription,
            });

            if (shopDomain) {
                clearCampaignDraft(shopDomain);
            }

            setIsLaunching(false);
            const redirectHref = isScheduled
                ? `${campaignsHref}${campaignsHref.includes('?') ? '&' : '?'}tab=scheduled`
                : campaignsHref;
            router.push(redirectHref);

            void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns(shopDomain) });

            const persistedMedia = await cacheLaunchMedia(shopDomain, optimisticId, launchMedia);

            const launchPayload: CampaignLaunchPayload = {
                shopDomain,
                optimisticId,
                draftCampaignId,
                title: title || 'Untitled Campaign',
                message: message || '',
                primaryLink: primaryLink || '',
                segmentId,
                actionButtons: actionButtons
                    .filter((button) => button.title?.trim() && button.link?.trim())
                    .map((button) => ({ title: button.title.trim(), link: button.link.trim() })),
                deliveryPayload,
                launchMedia: persistedMedia,
                displayMedia,
                launchingExistingDraft,
                isScheduled,
                scheduledAt: isScheduled ? scheduledAt?.toISOString() ?? null : null,
                segmentSubscriberCount,
                startedAt: new Date().toISOString(),
            };

            persistPendingCampaignLaunch(shopDomain, launchPayload);
            void runCampaignBackgroundLaunch(queryClient, launchPayload).catch(() => undefined);
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

    const handleSaveDraft = () => {
        if (!shopDomain) {
            toast({
                variant: 'destructive',
                title: 'Draft save failed',
                description: 'Open Push Eagle from Shopify Admin before saving drafts.',
            });
            return;
        }

        try {
            const draftInput = {
                shopDomain,
                draftCampaignId,
                title,
                message,
                primaryLink,
                segmentId,
                actionButtons,
                logoPreview: logo.preview,
                windowsHeroPreview: windowsHero.preview,
                macHeroPreview: macHero.preview,
                androidHeroPreview: androidHero.preview,
                sendingOption,
                scheduledDate,
                scheduledTime,
                smartDeliver,
                flashSaleEnabled,
                flashSaleDiscountPercent,
                flashSaleOriginalPrice,
                flashSaleSalePrice,
                flashSaleExpiresAt,
                flashSaleExpiresTime,
                flashSaleUrgencyText,
            };

            commitCampaignDraftSave(draftInput, queryClient, {
                onNavigate: (campaignsHref) => {
                    toast({
                        title: "Draft Saved!",
                        description: "Your campaign has been saved as a draft.",
                    });
                    clearCampaignDraft(shopDomain);
                    router.push(campaignsHref);
                },
                onError: (error) => {
                    toast({
                        variant: 'destructive',
                        title: 'Draft save failed',
                        description: error.message,
                    });
                },
            });
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
                                <p className="font-medium">
                                    {flashSaleEnabled ? 'Flash sale' : 'Regular campaign'}
                                </p>
                                {flashSaleEnabled && flashSaleEndsAt ? (
                                    <p className="text-sm text-muted-foreground">
                                        Expires {formatCampaignScheduleLabel(flashSaleEndsAt)}
                                    </p>
                                ) : null}
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Campaign gets delivered to</p>
                                <p className="font-medium flex items-center gap-2"><Users className="h-4 w-4" /> {segmentDisplayName} ({segmentSubscriberCount.toLocaleString()} subscribers)</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Starts</p>
                                <p className="font-medium flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    {sendingOption === 'schedule'
                                        ? formatCampaignScheduleLabel(scheduledAt)
                                        : 'Immediately'}
                                </p>
                            </div>
                            {smartDeliver ? (
                                <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">Smart delivery</p>
                                    <p className="font-medium">Enabled — sends when each subscriber is most active</p>
                                </div>
                            ) : null}
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
                <Button variant="outline" onClick={handleSaveDraft}>
                    <Save className="mr-2 h-4 w-4" />
                    Save as Draft
                </Button>
                <Button 
                    size="lg" 
                    onClick={handleLaunchCampaign} 
                    disabled={isLaunching || !title || !primaryLink}
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
