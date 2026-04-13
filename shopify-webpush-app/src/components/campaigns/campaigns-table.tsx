
'use client';

import { useState, useEffect, useMemo, startTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNow, isWithinInterval } from 'date-fns';
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Rocket, Users, Calendar, Hash, Copy } from "lucide-react"
import { Card, CardContent } from "../ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"
import { Skeleton } from "../ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { useSettings } from "@/context/settings-context";

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
    status: 'Sent' | 'Scheduled' | 'Draft' | 'Archived' | 'Paused';
    createdAt?: string;
};

const TableSkeleton = () => (
    <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
    </div>
)

export function CampaignsTable({ dateRange }: { dateRange: DateRange | undefined }) {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('sent');
    const { shopDomain } = useSettings();

    const mapApiCampaign = (campaign: any): Campaign => {
        const statusMap: Record<string, Campaign['status']> = {
            draft: 'Draft',
            scheduled: 'Scheduled',
            sending: 'Scheduled',
            sent: 'Sent',
            archived: 'Archived',
            paused: 'Paused',
        };

        const clickCount = Number(campaign.click_count ?? 0);
        const deliveryCount = Number(campaign.delivery_count ?? 0);
        const ctr = deliveryCount > 0 ? `${((clickCount / deliveryCount) * 100).toFixed(1)}%` : '0.0%';

        return {
            id: String(campaign.id),
            name: campaign.title ?? 'Untitled Campaign',
            message: campaign.body ?? '',
            imagePreviewUrl: campaign.image_url ?? null,
            sendTime: campaign.sent_at ?? campaign.created_at ?? new Date().toISOString(),
            segment: campaign.segment_id ? `Segment ${campaign.segment_id}` : 'All Subscribers',
            reached: deliveryCount,
            clickRate: ctr,
            sales: Number(campaign.revenue_cents ?? 0) / 100,
            status: statusMap[String(campaign.status ?? '').toLowerCase()] ?? 'Draft',
            createdAt: campaign.created_at ?? new Date().toISOString(),
        };
    };

    useEffect(() => {
        const fetchCampaigns = async () => {
            setLoading(true);
            setError(null);
            try {
                if (!shopDomain) {
                    setCampaigns([]);
                    return;
                }

                const response = await fetch(`/api/campaigns?shop=${encodeURIComponent(shopDomain)}`);
                const data = await response.json();

                if (!response.ok || !data?.ok) {
                    throw new Error(data?.error ?? 'Failed to load campaigns.');
                }

                setCampaigns((data.campaigns ?? []).map(mapApiCampaign));
            } catch (error) {
                setCampaigns([]);
                setError(error instanceof Error ? error.message : 'Failed to load campaigns.');
            } finally {
                setLoading(false);
            }
        };

        fetchCampaigns();
    }, [shopDomain]);
    
    const filteredCampaigns = useMemo(() => {
        let tabFiltered;
        tabFiltered = campaigns.filter(c => c.status.toLowerCase() === activeTab);
        
        if (!dateRange || !dateRange.from) {
            return tabFiltered;
        }

        return tabFiltered.filter(campaign => {
            try {
                if (campaign.status === 'Draft' || campaign.status === 'Scheduled') return true;
                const campaignDate = new Date(campaign.sendTime);
                if (isNaN(campaignDate.getTime())) return false;
                 
                const toDate = dateRange.to ?? dateRange.from!;
                return isWithinInterval(campaignDate, { start: dateRange.from!, end: toDate });
            } catch(e) {
                return false;
            }
        });
    }, [campaigns, activeTab, dateRange]);

    const tabCounts = useMemo(() => {
        return {
            sent: campaigns.filter(c => c.status === 'Sent').length,
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
            {filteredCampaigns.map(campaign => {
                const ctr = Number.parseFloat(campaign.clickRate);
                const clicks = Number.isFinite(ctr) ? Math.round(campaign.reached * (ctr / 100)) : null;

                return (
                    <Card key={campaign.id} className="transition-shadow duration-300 hover:shadow-lg">
                        <div className="p-4 space-y-4">
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="w-full md:w-40 h-24 relative shrink-0 rounded-md overflow-hidden bg-muted">
                                    <Image 
                                        src={campaign.imagePreviewUrl || "https://placehold.co/160x90.png"}
                                        alt={campaign.name} 
                                        layout="fill"
                                        objectFit="cover"
                                        data-ai-hint="product sale"
                                    />
                                </div>
                                <div className="flex-grow flex flex-col sm:flex-row justify-between gap-4">
                                    <div className="flex flex-col">
                                        <h3 className="font-semibold text-base line-clamp-1" title={campaign.name}>
                                            <Link href={`/campaigns/${campaign.id}/results`} className="hover:underline">{campaign.name}</Link>
                                        </h3>
                                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2 max-w-prose" title={campaign.message}>
                                            {campaign.message || "No message provided."}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm sm:text-right w-full sm:max-w-md">
                                        <div>
                                            <p className="text-muted-foreground">Impressions</p>
                                            <p className="font-medium">{campaign.reached?.toLocaleString() ?? 'N/A'}</p>
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
            <h2 className="text-xl font-semibold tracking-tight">Campaign History</h2>
            <Tabs defaultValue="sent" onValueChange={(value) => startTransition(() => setActiveTab(value))}>
                <TabsList>
                    <TabsTrigger value="sent">Sent <Badge variant={activeTab === 'sent' ? 'default' : 'secondary'} className="ml-2">{tabCounts.sent}</Badge></TabsTrigger>
                    <TabsTrigger value="scheduled">Scheduled <Badge variant={activeTab === 'scheduled' ? 'default' : 'secondary'} className="ml-2">{tabCounts.scheduled}</Badge></TabsTrigger>
                    <TabsTrigger value="draft">Drafts <Badge variant={activeTab === 'draft' ? 'default' : 'secondary'} className="ml-2">{tabCounts.draft}</Badge></TabsTrigger>
                </TabsList>
                <TabsContent value={activeTab} className="mt-6">
                    {renderContent()}
                </TabsContent>
            </Tabs>
        </div>
    );
}
