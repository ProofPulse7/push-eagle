
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Bot, Calendar, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { OverviewStats } from '@/components/campaigns/results/overview-stats';
import { PerformanceOverTimeChart } from '@/components/campaigns/results/performance-over-time-chart';
import { PlatformPerformance } from '@/components/campaigns/results/platform-performance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSettings } from '@/context/settings-context';

type Campaign = {
    id: string;
    name: string;
    sendTime: string;
    segment: string;
    reached: number;
    clickRate: string;
    sales: number;
    status: 'Sent' | 'Scheduled' | 'Draft' | 'Archived';
};

type ResultsPayload = {
    performanceOverTime: Array<{ hour: string; clicks: number }>;
    platformPerformance: Array<{ platform: string; clicks: number }>;
};

export default function CampaignResultsPage() {
    const params = useParams();
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    const { shopDomain } = useSettings();
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [results, setResults] = useState<ResultsPayload>({ performanceOverTime: [], platformPerformance: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;

        const fetchCampaign = async () => {
            setLoading(true);
            setError(null);

            try {
                const params = new URLSearchParams();
                if (shopDomain) {
                    params.set('shop', shopDomain);
                }

                const campaignUrl = `/api/campaigns/${id}${params.size ? `?${params.toString()}` : ''}`;
                const resultsUrl = `/api/campaigns/${id}/results${params.size ? `?${params.toString()}` : ''}`;

                const [campaignResponse, resultsResponse] = await Promise.all([
                    fetch(campaignUrl),
                    fetch(resultsUrl),
                ]);

                const campaignData = await campaignResponse.json();
                const resultsData = await resultsResponse.json();

                if (!campaignResponse.ok || !campaignData?.ok) {
                    throw new Error(campaignData?.error ?? 'Campaign not found.');
                }

                if (!resultsResponse.ok || !resultsData?.ok) {
                    throw new Error(resultsData?.error ?? 'Failed to load campaign results.');
                }

                const row = campaignData.campaign;
                const deliveryCount = Number(row.delivery_count ?? 0);
                const clickCount = Number(row.click_count ?? 0);

                setCampaign({
                    id: String(row.id),
                    name: row.title ?? 'Untitled Campaign',
                    sendTime: row.sent_at ?? row.created_at ?? new Date().toISOString(),
                    segment: row.segment_id ? `Segment ${row.segment_id}` : 'All Subscribers',
                    reached: deliveryCount,
                    clickRate: deliveryCount > 0 ? `${((clickCount / deliveryCount) * 100).toFixed(1)}%` : '0.0%',
                    sales: Number(row.revenue_cents ?? 0) / 100,
                    status:
                        String(row.status).toLowerCase() === 'sent'
                            ? 'Sent'
                            : String(row.status).toLowerCase() === 'scheduled'
                            ? 'Scheduled'
                            : String(row.status).toLowerCase() === 'archived'
                            ? 'Archived'
                            : 'Draft',
                });

                setResults({
                    performanceOverTime: Array.isArray(resultsData.performanceOverTime) ? resultsData.performanceOverTime : [],
                    platformPerformance: Array.isArray(resultsData.platformPerformance) ? resultsData.platformPerformance : [],
                });
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to fetch campaign data.');
            } finally {
                setLoading(false);
            }
        };

        fetchCampaign();
    }, [id, shopDomain]);

    if (loading) {
        return <PageSkeleton />;
    }

    if (error) {
        return <div className="p-8 text-center text-destructive">{error}</div>;
    }

    if (!campaign) {
        return <div className="p-8 text-center">No campaign data available.</div>;
    }

    const stats = {
        reached: campaign.reached,
        clickRate: campaign.clickRate,
        sales: campaign.sales,
    };

    const chartData = results.performanceOverTime.length
        ? results.performanceOverTime
        : Array.from({ length: 12 }).map((_, index) => ({ hour: `${index * 2}h`, clicks: 0 }));

    const platformData = results.platformPerformance.length
        ? results.platformPerformance.map((item) => ({ ...item, platform: item.platform.toUpperCase() }))
        : [{ platform: 'UNKNOWN', clicks: 0 }];

    return (
        <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
            <div className="flex items-center justify-between gap-4">
                <div className='flex items-center gap-4'>
                    <Button variant="outline" size="icon" asChild>
                        <Link href="/campaigns">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="sr-only">Back to Campaigns</span>
                        </Link>
                    </Button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{campaign.name}</h1>
                             <Badge variant={
                                campaign.status === 'Sent' ? 'default' :
                                campaign.status === 'Archived' ? 'destructive' : 'secondary'
                             }>
                                {campaign.status}
                            </Badge>
                        </div>
                        <p className="text-muted-foreground">Detailed results and analytics for your campaign.</p>
                    </div>
                </div>
                <Button>
                    <Bot className="mr-2 h-4 w-4" />
                    Get AI Recommendations
                </Button>
            </div>

            <OverviewStats stats={stats} />

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
                <div className="lg:col-span-3">
                    <PerformanceOverTimeChart data={chartData} />
                </div>
                 <div className="lg:col-span-2">
                    <PlatformPerformance data={platformData} />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Campaign Details</CardTitle>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 text-sm">
                    <div className="flex items-start gap-3">
                        <Users className="h-5 w-5 mt-0.5 text-primary" />
                        <div>
                            <p className="text-muted-foreground">Segment</p>
                            <p className="font-medium">{campaign.segment || 'N/A'}</p>
                        </div>
                    </div>
                     <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 mt-0.5 text-primary" />
                        <div>
                            <p className="text-muted-foreground">Sent On</p>
                            <p className="font-medium">{campaign.sendTime ? new Date(campaign.sendTime).toLocaleString() : 'N/A'}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}

const PageSkeleton = () => (
    <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10" />
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-48" />
                </div>
            </div>
            <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
        </div>
         <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
            <div className="lg:col-span-3">
                <Skeleton className="h-80 w-full" />
            </div>
            <div className="lg:col-span-2">
                <Skeleton className="h-80 w-full" />
            </div>
        </div>
    </div>
);
