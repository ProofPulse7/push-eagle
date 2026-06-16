
'use client';

import { useState, useMemo, startTransition, useEffect } from "react";
import Link from "next/link";
import { formatDistanceToNow, isWithinInterval } from 'date-fns';
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Rocket, Users, Calendar, Hash, Copy, CheckCircle, Clock, AlertCircle, ChevronDown } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { Skeleton } from "../ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { pickCampaignBarImageUrl } from '@/lib/client/campaign-bar-image';
import { useCampaigns } from '@/hooks/queries/use-app-queries';

type Campaign = {
    id: string;
    name: string;
    message?: string;
    imagePreviewUrl?: string | null;
    sendTime: string;
    segment: string;
    reached: number;
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

const mapApiCampaign = (campaign: Record<string, unknown>): Campaign => {
    const statusMap: Record<string, Campaign['status']> = {
        draft: 'Draft',
        scheduled: 'Scheduled',
        queued: 'Scheduled',
        sending: 'Sending',
        sent: 'Sent',
        archived: 'Archived',
        paused: 'Paused',
    };

    const clickCount = Number(campaign.click_count ?? campaign.clickCount ?? 0);
    const deliveryCount = Number(campaign.delivery_count ?? campaign.deliveryCount ?? 0);
    const ctr = deliveryCount > 0 ? `${((clickCount / deliveryCount) * 100).toFixed(1)}%` : '0.0%';

    return {
        id: String(campaign.id),
        name: String(campaign.title ?? 'Untitled Campaign'),
        message: String(campaign.body ?? ''),
        imagePreviewUrl: pickCampaignBarImageUrl({
            imageUrl: (campaign.image_url ?? campaign.imageUrl) as string | null | undefined,
            windowsImageUrl: (campaign.windows_image_url ?? campaign.windowsImageUrl) as string | null | undefined,
            macosImageUrl: (campaign.macos_image_url ?? campaign.macosImageUrl) as string | null | undefined,
            androidImageUrl: (campaign.android_image_url ?? campaign.androidImageUrl) as string | null | undefined,
        }),
        sendTime: String(campaign.sent_at ?? campaign.sentAt ?? campaign.created_at ?? campaign.createdAt ?? new Date().toISOString()),
        segment: campaign.segment_id === 'all' || !campaign.segment_id
            ? 'All Subscribers'
            : `Segment ${String(campaign.segment_id ?? campaign.segmentId ?? '')}`,
        reached: deliveryCount,
        clickRate: ctr,
        sales: Number(campaign.revenue_cents ?? campaign.revenueCents ?? 0) / 100,
        status: statusMap[String(campaign.status ?? '').toLowerCase()] ?? 'Draft',
        createdAt: String(campaign.created_at ?? campaign.createdAt ?? new Date().toISOString()),
    };
};

export function CampaignsTable({ dateRange }: { dateRange: DateRange | undefined }) {
    const { data, isLoading, isError, error: queryError, isFetching } = useCampaigns();
    const [activeTab, setActiveTab] = useState('sent');
    const [visibleCount, setVisibleCount] = useState(CAMPAIGNS_PAGE_SIZE);

    const campaigns = useMemo(() => {
        if (!Array.isArray(data?.campaigns)) {
            return [];
        }

        return (data.campaigns as Record<string, unknown>[]).map(mapApiCampaign);
    }, [data]);

    const error = isError
        ? queryError instanceof Error
            ? queryError.message
            : 'Failed to load campaigns.'
        : null;

    const loading = isLoading && campaigns.length === 0 && !data;
    
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
                            <Link href="/campaigns/new">
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
                const clicks = Number.isFinite(ctr) ? Math.round(campaign.reached * (ctr / 100)) : null;

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
                                                <Link href={`/campaigns/${campaign.id}/results`} className="hover:underline">{campaign.name}</Link>
                                            </h3>
                                            {getStatusBadge(campaign.status)}
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2 max-w-prose" title={campaign.message}>
                                            {campaign.message || "No message provided."}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm sm:text-right w-full sm:max-w-md">
                                        <div>
                                            <p className="text-muted-foreground">Impressions</p>
                                            <p className="font-medium">
                                                {campaign.status === 'Sending' && campaign.reached === 0
                                                    ? 'Sending…'
                                                    : (campaign.reached?.toLocaleString() ?? '0')}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">Clicks</p>
                                            <p className="font-medium">{clicks === null ? 'N/A' : clicks.toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">CTR</p>
                                            <p className="font-medium">{campaign.clickRate}</p>
                                        </div>
                                        <div>
                                            <p className="text-muted-foreground">Revenue</p>
                                            <p className="font-medium">{typeof campaign.sales === 'number' ? formatCurrency(campaign.sales) : 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="pt-4 border-t flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div className="text-xs text-muted-foreground flex items-center gap-4 flex-wrap">
                                    <div className="flex items-center gap-1.5"><Users className="h-3 w-3" /><span>{campaign.segment}</span></div>
                                    <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /><span>{campaign.createdAt ? formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true }) : 'Just now'}</span></div>
                                    <div className="flex items-center gap-1.5"><Hash className="h-3 w-3" /><span>ID: {campaign.id}</span></div>
                                </div>
                                <Button variant="outline" size="sm" className="mt-2 sm:mt-0 self-end sm:self-center"><Copy className="mr-2 h-3 w-3"/>Duplicate</Button>
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
                {isFetching && campaigns.length > 0 ? (
                    <span className="text-xs text-muted-foreground">Updating…</span>
                ) : null}
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
