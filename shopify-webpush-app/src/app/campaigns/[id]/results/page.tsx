
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

// Mock campaigns data since Firebase is removed
const mockCampaigns: Campaign[] = [
    { id: 'summer-sale-2024', name: 'Summer Sale 2024', sendTime: new Date().toISOString(), segment: 'All Subscribers', reached: 250000, clickRate: '15.6%', sales: 5302.50, status: 'Sent' },
    { id: 'new-arrivals-june', name: 'New Arrivals - June', sendTime: new Date().toISOString(), segment: 'High-Value Customers', reached: 180500, clickRate: '10.2%', sales: 3120.00, status: 'Sent' },
];

export default function CampaignResultsPage() {
    const params = useParams();
    const id = params.id as string;
    const [campaign, setCampaign] = useState<Campaign | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        const fetchCampaign = async () => {
            setLoading(true);
            try {
                // Find campaign in mock data
                const foundCampaign = mockCampaigns.find(c => c.id === id);

                if (foundCampaign) {
                    setCampaign(foundCampaign);
                } else {
                    // Try to find in sessionStorage for newly created campaigns
                    const newCampaignJson = sessionStorage.getItem('newCampaign');
                    if (newCampaignJson) {
                        const newCampaign = JSON.parse(newCampaignJson);
                        if (newCampaign.id === id) {
                            setCampaign(newCampaign);
                        } else {
                            setError("Campaign not found.");
                        }
                    } else {
                         setError("Campaign not found.");
                    }
                }
            } catch (err) {
                console.error(err);
                setError("Failed to fetch campaign data.");
            } finally {
                setLoading(false);
            }
        };

        fetchCampaign();
    }, [id]);

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
                    <PerformanceOverTimeChart />
                </div>
                 <div className="lg:col-span-2">
                    <PlatformPerformance />
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
