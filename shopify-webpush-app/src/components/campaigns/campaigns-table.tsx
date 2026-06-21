
'use client';

import { useState, useMemo, startTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow, isWithinInterval } from 'date-fns';
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Rocket, Users, Calendar, Hash, Copy, CheckCircle, Clock, AlertCircle, ChevronDown, Loader2, Pencil, Trash2 } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { Skeleton } from "../ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { pickCampaignBarImageUrl } from '@/lib/client/campaign-bar-image';
import { applyLaunchMediaToCampaign } from '@/lib/client/campaign-launch-media-cache';
import { useCampaigns } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { formatCampaignScheduleLabel } from '@/lib/client/campaign-schedule';
import {
    beginEditDraftCampaign,
    duplicateCampaignToWizard,
    refreshEditDraftCampaignInBackground,
} from '@/lib/client/campaign-duplicate';
import { removeOptimisticCampaign } from '@/lib/client/optimistic-campaigns';
import { queryKeys } from '@/lib/client/query-keys';
import { appendFreshCampaignWizardParam } from '@/lib/client/campaign-wizard-fresh';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

type Campaign = {
    id: string;
    name: string;
    message?: string;
    imagePreviewUrl?: string | null;
    sendTime: string;
    scheduledAt?: string | null;
    sentAt?: string | null;
    flashSaleEndsAt?: string | null;
    smartDelivery?: boolean;
    segment: string;
    impressions: number;
    deliveryCount: number;
    clickRate: string;
    sales: number;
    status: 'Sent' | 'Scheduled' | 'Draft' | 'Archived' | 'Paused' | 'Sending';
    createdAt?: string;
};

const CAMPAIGNS_PAGE_SIZE = 10;

const tabTriggerClass =
    "rounded-md px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm data-[state=inactive]:bg-transparent";

const TableSkeleton = () => (
    <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
    </div>
)

const mapApiCampaign = (shop: string, campaign: Record<string, unknown>): Campaign => {
    const enriched = applyLaunchMediaToCampaign(shop, campaign);
    const statusMap: Record<string, Campaign['status']> = {
        draft: 'Draft',
        scheduled: 'Scheduled',
        queued: 'Sending',
        sending: 'Sending',
        sent: 'Sent',
        archived: 'Archived',
        paused: 'Paused',
    };

    const clickCount = Number(enriched.click_count ?? enriched.clickCount ?? 0);
    const deliveryCount = Number(enriched.delivery_count ?? enriched.deliveryCount ?? 0);
    const targetRecipientCount = Number(
        enriched.target_recipient_count ?? enriched.targetRecipientCount ?? 0,
    );
    let rawStatus = String(enriched.status ?? '').toLowerCase();
    const sentAtRaw = enriched.sent_at ?? enriched.sentAt;
    if (
        rawStatus === 'draft'
        && (sentAtRaw || targetRecipientCount > 0)
        && deliveryCount === 0
    ) {
        rawStatus = 'sending';
    }
    const mappedStatus = statusMap[rawStatus] ?? 'Draft';
    const scheduledAtRaw = enriched.scheduled_at ?? enriched.scheduledAt;
    const scheduledAt = scheduledAtRaw ? String(scheduledAtRaw) : null;
    const sentAt = sentAtRaw ? String(sentAtRaw) : null;
    const flashSaleEndsAtRaw = enriched.flash_sale_ends_at ?? enriched.flashSaleEndsAt;
    const flashSaleEndsAt = flashSaleEndsAtRaw ? String(flashSaleEndsAtRaw) : null;
    const smartDelivery = Boolean(enriched.smart_send_enabled ?? enriched.smartSendEnabled);
    const impressions =
        mappedStatus === 'Sending'
            ? Math.max(targetRecipientCount, deliveryCount, 0)
            : deliveryCount;
    const ctr =
        mappedStatus === 'Sent' && deliveryCount > 0
            ? `${((clickCount / deliveryCount) * 100).toFixed(1)}%`
            : '0.0%';

    return {
        id: String(enriched.id),
        name: String(enriched.title ?? 'Untitled Campaign'),
        message: String(enriched.body ?? ''),
        imagePreviewUrl: pickCampaignBarImageUrl({
            imageUrl: (enriched.image_url ?? enriched.imageUrl) as string | null | undefined,
            windowsImageUrl: (enriched.windows_image_url ?? enriched.windowsImageUrl) as string | null | undefined,
            macosImageUrl: (enriched.macos_image_url ?? enriched.macosImageUrl) as string | null | undefined,
            androidImageUrl: (enriched.android_image_url ?? enriched.androidImageUrl) as string | null | undefined,
        }),
        sendTime: String(
            mappedStatus === 'Scheduled' && scheduledAt
                ? scheduledAt
                : sentAt ?? scheduledAt ?? enriched.created_at ?? enriched.createdAt ?? new Date().toISOString(),
        ),
        scheduledAt,
        sentAt,
        flashSaleEndsAt,
        smartDelivery,
        segment: enriched.segment_id === 'all' || !enriched.segment_id
            ? 'All Subscribers'
            : `Segment ${String(enriched.segment_id ?? enriched.segmentId ?? '')}`,
        impressions,
        deliveryCount,
        clickRate: ctr,
        sales: Number(enriched.revenue_cents ?? enriched.revenueCents ?? 0) / 100,
        status: mappedStatus,
        createdAt: String(enriched.created_at ?? enriched.createdAt ?? new Date().toISOString()),
    };
};

export function CampaignsTable({ dateRange }: { dateRange: DateRange | undefined }) {
    const shopDomain = useShopDomain();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const cachedData = shopDomain
        ? queryClient.getQueryData<{ campaigns?: unknown[] }>(queryKeys.campaigns(shopDomain))
        : undefined;
    const { data, isLoading, isError, error: queryError } = useCampaigns();
    const effectiveData = data ?? cachedData;
    const initialTab = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState(
        initialTab === 'scheduled' || initialTab === 'draft' ? initialTab : 'sent',
    );
    const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
    const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(CAMPAIGNS_PAGE_SIZE);

    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab === 'scheduled' || tab === 'draft') {
            setActiveTab(tab);
        }
    }, [searchParams]);

    const campaigns = useMemo(() => {
        if (!Array.isArray(effectiveData?.campaigns)) {
            return [];
        }

        return (effectiveData.campaigns as Record<string, unknown>[]).map((campaign) =>
            mapApiCampaign(shopDomain, campaign),
        );
    }, [effectiveData, shopDomain]);

    const error = isError
        ? queryError instanceof Error
            ? queryError.message
            : 'Failed to load campaigns.'
        : null;

    const loading = isLoading && campaigns.length === 0 && !effectiveData;
    
    const filteredCampaigns = useMemo(() => {
        let tabFiltered;
        if (activeTab === 'sent') {
            tabFiltered = campaigns.filter(c => c.status === 'Sent' || c.status === 'Sending');
        } else {
            tabFiltered = campaigns.filter(c => c.status.toLowerCase() === activeTab);
        }
        
        if (!dateRange || !dateRange.from) {
            return tabFiltered;
        }

        return tabFiltered.filter(campaign => {
            try {
                if (campaign.status === 'Draft' || campaign.status === 'Scheduled' || campaign.status === 'Sending') return true;
                const campaignDate = new Date(campaign.sendTime);
                if (isNaN(campaignDate.getTime())) return false;
                 
                const toDate = dateRange.to ?? dateRange.from!;
                return isWithinInterval(campaignDate, { start: dateRange.from!, end: toDate });
            } catch {
                return false;
            }
        });
    }, [campaigns, activeTab, dateRange]);

    useEffect(() => {
        setVisibleCount(CAMPAIGNS_PAGE_SIZE);
    }, [activeTab, dateRange?.from?.getTime(), dateRange?.to?.getTime()]);

    const visibleCampaigns = useMemo(
        () => filteredCampaigns.slice(0, visibleCount),
        [filteredCampaigns, visibleCount],
    );

    const hasMoreCampaigns = filteredCampaigns.length > visibleCount;

    const tabCounts = useMemo(() => {
        return {
            sent: campaigns.filter(c => c.status === 'Sent' || c.status === 'Sending').length,
            scheduled: campaigns.filter(c => c.status === 'Scheduled').length,
            draft: campaigns.filter(c => c.status === 'Draft').length,
        }
    }, [campaigns]);

    const handleDuplicateCampaign = async (campaignId: string) => {
        if (!shopDomain) {
            toast({
                variant: 'destructive',
                title: 'Duplicate failed',
                description: 'Open Push Eagle from Shopify Admin before duplicating campaigns.',
            });
            return;
        }

        setDuplicatingId(campaignId);
        try {
            const { detailsHref } = await duplicateCampaignToWizard(shopDomain, campaignId);
            router.push(detailsHref);
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Duplicate failed',
                description: error instanceof Error ? error.message : 'Failed to duplicate campaign.',
            });
        } finally {
            setDuplicatingId(null);
        }
    };

    const handleEditDraft = (campaignId: string) => {
        if (!shopDomain) {
            toast({
                variant: 'destructive',
                title: 'Edit failed',
                description: 'Open Push Eagle from Shopify Admin before editing drafts.',
            });
            return;
        }

        const rawCampaign = Array.isArray(effectiveData?.campaigns)
            ? (effectiveData.campaigns as Record<string, unknown>[]).find(
                  (campaign) => String(campaign.id) === campaignId,
              )
            : undefined;

        const began = beginEditDraftCampaign(shopDomain, campaignId, rawCampaign);
        router.push(began.detailsHref);

        void refreshEditDraftCampaignInBackground(shopDomain, campaignId, began).catch((error) => {
            if (!began.hadSyncDraft) {
                toast({
                    variant: 'destructive',
                    title: 'Edit failed',
                    description: error instanceof Error ? error.message : 'Failed to open draft campaign.',
                });
            }
        });
    };

    const handleDeleteDraft = async (campaignId: string) => {
        if (!shopDomain) {
            toast({
                variant: 'destructive',
                title: 'Delete failed',
                description: 'Open Push Eagle from Shopify Admin before deleting drafts.',
            });
            return;
        }

        setDeletingDraftId(campaignId);
        try {
            const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}?shop=${encodeURIComponent(shopDomain)}`, {
                method: 'DELETE',
            });
            const payload = await response.json();
            if (!response.ok || !payload?.ok) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : 'Failed to delete draft.');
            }

            removeOptimisticCampaign(queryClient, shopDomain, campaignId);
            void queryClient.invalidateQueries({ queryKey: queryKeys.campaigns(shopDomain) });

            toast({
                title: 'Draft deleted',
                description: 'The draft campaign has been removed.',
            });
        } catch (error) {
            toast({
                variant: 'destructive',
                title: 'Delete failed',
                description: error instanceof Error ? error.message : 'Failed to delete draft campaign.',
            });
        } finally {
            setDeletingDraftId(null);
        }
    };


    const renderEmptyStateForTab = () => {
        const emptyStateMessages = {
            sent: {
                title: "No Sent Campaigns",
                description: "Campaigns within the selected date range will appear here."
            },
            scheduled: {
                title: "No Scheduled Campaigns",
                description: "Future campaigns you schedule will appear here."
            },
            draft: {
                title: "No Draft Campaigns",
                description: "You can save campaigns as drafts to finish them later."
            }
        };

        const { title, description } = emptyStateMessages[activeTab as keyof typeof emptyStateMessages] || { title: "No Campaigns Found", description: "There are no campaigns in this category." };
        
        return (
            <Card>
                <CardContent className="text-center p-12 sm:p-16">
                    <div className="mx-auto max-w-xs flex flex-col items-center">
                        <div className="bg-primary/10 p-4 rounded-full mb-6">
                            <Rocket className="w-12 h-12 text-primary" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">{title}</h3>
                        <p className="text-muted-foreground mb-6">{description}</p>
                        <Button asChild>
                            <Link href={appendFreshCampaignWizardParam('/campaigns/new/details')}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                New Campaign
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    };

    const renderCampaignsList = () => (
        <div className="space-y-4">
            {visibleCampaigns.map(campaign => {
                const ctr = Number.parseFloat(campaign.clickRate);
                const clicks =
                    campaign.status === 'Sent' && Number.isFinite(ctr)
                        ? Math.round(campaign.deliveryCount * (ctr / 100))
                        : 0;

                const getStatusIcon = (status: string) => {
                    switch (status) {
                        case 'Sent':
                        case 'Sending':
                            return <CheckCircle className="h-3 w-3 text-green-500" />;
                        case 'Scheduled':
                            return <Clock className="h-3 w-3 text-orange-500" />;
                        case 'Draft':
                            return <AlertCircle className="h-3 w-3 text-gray-500" />;
                        default:
                            return null;
                    }
                };

                const getStatusBadge = (status: string) => {
                    const variants = {
                        'Sent': 'default',
                        'Scheduled': 'secondary',
                        'Draft': 'outline',
                        'Sending': 'default',
                        'Archived': 'outline',
                        'Paused': 'destructive',
                    } as const;

                    return (
                        <Badge variant={variants[status as keyof typeof variants] || 'outline'} className="flex items-center gap-1">
                            {getStatusIcon(status)}
                            {status}
                        </Badge>
                    );
                };

                const formatSendLabel = () => {
                    if (campaign.status === 'Scheduled' && campaign.scheduledAt) {
                        return `Sends ${formatCampaignScheduleLabel(new Date(campaign.scheduledAt))}`;
                    }

                    if ((campaign.status === 'Sent' || campaign.status === 'Sending') && campaign.sentAt) {
                        return `Sent ${formatCampaignScheduleLabel(new Date(campaign.sentAt))}`;
                    }

                    if (campaign.status === 'Sending' && campaign.scheduledAt) {
                        return `Sending (scheduled ${formatCampaignScheduleLabel(new Date(campaign.scheduledAt))})`;
                    }

                    return campaign.createdAt
                        ? Date.now() - new Date(campaign.createdAt).getTime() < 60_000
                            ? 'Created just now'
                            : `Created ${formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}`
                        : 'Created just now';
                };

                return (
                    <Card key={campaign.id} className="transition-shadow duration-300 hover:shadow-lg">
                        <div className="p-4 space-y-4">
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="w-full md:w-40 h-24 relative shrink-0 rounded-md overflow-hidden bg-muted">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={campaign.imagePreviewUrl || "https://placehold.co/160x90.png"}
                                        alt={campaign.name}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                    />
                                </div>
                                <div className="flex-grow flex flex-col sm:flex-row justify-between gap-4">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-semibold text-base line-clamp-1" title={campaign.name}>
                                                <span>{campaign.name}</span>
                                            </h3>
                                            {getStatusBadge(campaign.status)}
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2 max-w-prose" title={campaign.message}>
                                            {campaign.message || "No message provided."}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm sm:text-right w-full sm:max-w-md shrink-0">
                                        <div className="min-w-[5rem]">
                                            <p className="text-muted-foreground">Impressions</p>
                                            <p className="font-medium tabular-nums">
                                                {campaign.impressions.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="min-w-[4rem]">
                                            <p className="text-muted-foreground">Clicks</p>
                                            <p className="font-medium tabular-nums">{clicks.toLocaleString()}</p>
                                        </div>
                                        <div className="min-w-[4rem]">
                                            <p className="text-muted-foreground">CTR</p>
                                            <p className="font-medium tabular-nums">{campaign.clickRate}</p>
                                        </div>
                                        <div className="min-w-[5rem]">
                                            <p className="text-muted-foreground">Revenue</p>
                                            <p className="font-medium tabular-nums">{typeof campaign.sales === 'number' ? formatCurrency(campaign.sales) : 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="pt-4 border-t flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div className="text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
                                    <div className="flex items-center gap-1.5"><Users className="h-3 w-3" /><span>{campaign.segment}</span></div>
                                    <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" /><span>{formatSendLabel()}</span></div>
                                    {campaign.flashSaleEndsAt ? (
                                        <div className="flex items-center gap-1.5">
                                            <Calendar className="h-3 w-3" />
                                            <span>Expires {formatCampaignScheduleLabel(new Date(campaign.flashSaleEndsAt))}</span>
                                        </div>
                                    ) : null}
                                    {campaign.smartDelivery ? (
                                        <div className="flex items-center gap-1.5">
                                            <Rocket className="h-3 w-3" />
                                            <span>Smart delivery</span>
                                        </div>
                                    ) : null}
                                    <div className="flex items-center gap-1.5"><Hash className="h-3 w-3" /><span>ID: {campaign.id}</span></div>
                                </div>
                                <div className="flex items-center gap-2 mt-2 sm:mt-0 self-end sm:self-center">
                                    {campaign.status === 'Draft' ? (
                                        <>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={deletingDraftId === campaign.id}
                                                onClick={() => handleEditDraft(campaign.id)}
                                            >
                                                <Pencil className="mr-2 h-3 w-3" />
                                                Edit
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                disabled={deletingDraftId === campaign.id}
                                                onClick={() => void handleDeleteDraft(campaign.id)}
                                            >
                                                {deletingDraftId === campaign.id ? (
                                                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                                ) : (
                                                    <Trash2 className="mr-2 h-3 w-3" />
                                                )}
                                                Delete
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={duplicatingId === campaign.id}
                                            onClick={() => void handleDuplicateCampaign(campaign.id)}
                                        >
                                            {duplicatingId === campaign.id ? (
                                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                            ) : (
                                                <Copy className="mr-2 h-3 w-3" />
                                            )}
                                            Duplicate
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>
                );
            })}

            {hasMoreCampaigns ? (
                <div className="flex justify-center pt-2">
                    <Button
                        type="button"
                        className="bg-violet-600 text-white hover:bg-violet-600/90"
                        onClick={() => setVisibleCount((current) => current + CAMPAIGNS_PAGE_SIZE)}
                    >
                        <ChevronDown className="mr-2 h-4 w-4" />
                        Show more
                    </Button>
                </div>
            ) : null}
        </div>
    );

    const renderContent = () => {
        if (loading) {
             return <TableSkeleton />;
        }
        if (error) {
            return <p className="text-destructive text-center p-8">{error}</p>;
        }
        if (filteredCampaigns.length === 0) {
            return renderEmptyStateForTab();
        }
        return renderCampaignsList();
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight">Campaign History</h2>
            </div>
            <Tabs value={activeTab} onValueChange={(value) => startTransition(() => setActiveTab(value))}>
                <TabsList className="bg-white border shadow-sm h-auto p-1 gap-1">
                    <TabsTrigger value="sent" className={tabTriggerClass}>
                        Sent <Badge variant={activeTab === 'sent' ? 'secondary' : 'outline'} className="ml-2">{tabCounts.sent}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="scheduled" className={tabTriggerClass}>
                        Scheduled <Badge variant={activeTab === 'scheduled' ? 'secondary' : 'outline'} className="ml-2">{tabCounts.scheduled}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="draft" className={tabTriggerClass}>
                        Drafts <Badge variant={activeTab === 'draft' ? 'secondary' : 'outline'} className="ml-2">{tabCounts.draft}</Badge>
                    </TabsTrigger>
                </TabsList>
                <TabsContent value={activeTab} className="mt-6">
                    {renderContent()}
                </TabsContent>
            </Tabs>
        </div>
    );
}
