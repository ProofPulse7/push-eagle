
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { DateRange } from 'react-day-picker';
import { addDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Hand,
  ShoppingCart,
  Eye,
  Truck,
  ArchiveRestore,
  Tag,
  Lock,
  PlusCircle,
  type LucideIcon,
  ArrowRight,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { Skeleton } from '@/components/ui/skeleton';

type Automation = {
  id: string;
  icon: LucideIcon;
  title: string;
  status: 'Active' | 'Inactive';
  description: string;
  stats: {
    impressions: string;
    clicks: string;
    revenue: string;
  };
  isLocked: boolean;
};

const initialAutomationsData: Omit<Automation, 'stats'>[] = [
  {
    id: 'welcome-notifications',
    icon: Hand,
    title: 'Welcome notifications',
    status: 'Active',
    description: 'A sequence of notifications sent to the subscriber once they subscribe to your store notifications.',
    isLocked: false,
  },
  {
    id: 'abandoned-cart-recovery',
    icon: ShoppingCart,
    title: 'Abandoned cart recovery',
    status: 'Inactive',
    description: 'A sequence of notifications to remind the subscribers about the items they forgot in their cart.',
    isLocked: false,
  },
  {
    id: 'browse-abandonment',
    icon: Eye,
    title: 'Browse abandonment',
    status: 'Inactive',
    description: 'A sequence of notifications to remind customers if they view a product without adding it to cart.',
    isLocked: false,
  },
  {
    id: 'shipping-notifications',
    icon: Truck,
    title: 'Shipping notifications',
    status: 'Inactive',
    description: 'A notification is sent to the subscriber as soon as the status of their fulfillment is updated.',
    isLocked: false,
  },
  {
    id: 'back-in-stock',
    icon: ArchiveRestore,
    title: 'Back in stock',
    status: 'Inactive',
    description: 'A notification is sent to subscribers whenever an out-of-stock product is made available again.',
    isLocked: false,
  },
  {
    id: 'price-drop',
    icon: Tag,
    title: 'Price drop',
    status: 'Inactive',
    description: 'A notification is sent to the subscriber whenever the price of a product is dropped.',
    isLocked: false,
  },
];

const generateTopStats = () => ({
  impressions: (Math.floor(Math.random() * 20000) + 5000).toLocaleString(),
  clicks: (Math.floor(Math.random() * 5000) + 1000).toLocaleString(),
  revenue: formatCurrency(Math.random() * 15000 + 2000),
});

const generateAutomationStats = () => {
    return initialAutomationsData.map(auto => ({
        ...auto,
        stats: {
            impressions: (Math.floor(Math.random() * 5000)).toLocaleString(),
            clicks: (Math.floor(Math.random() * 1000)).toLocaleString(),
            revenue: formatCurrency(Math.random() * 2000),
        }
    }));
};

export default function AutomationsPage() {
    const [date, setDate] = useState<DateRange | undefined>(undefined);
    const [stats, setStats] = useState({ impressions: '0', clicks: '0', revenue: formatCurrency(0) });
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [loading, setLoading] = useState(true);
    
    useEffect(() => {
        setLoading(true);
        // Simulate data fetching delay
        const timer = setTimeout(() => {
            setStats(generateTopStats());
            setAutomations(generateAutomationStats());
            setLoading(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [date]);

    const handleToggleStatus = (automationId: string) => {
        setAutomations(prevAutomations =>
            prevAutomations.map(auto =>
                auto.id === automationId
                    ? { ...auto, status: auto.status === 'Active' ? 'Inactive' : 'Active' }
                    : auto
            )
        );
    };

    return (
        <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Automations</h1>
                    <p className="text-muted-foreground">Set up automated workflows to engage your audience.</p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold tracking-tight">Stats</h2>
                    <DateRangePicker date={date} setDate={setDate} />
                </div>
                <Card>
                    <CardContent className="p-0">
                         <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x">
                            {loading ? (
                                <>
                                    <div className="p-4 space-y-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-8 w-32" /></div>
                                    <div className="p-4 space-y-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-8 w-32" /></div>
                                    <div className="p-4 space-y-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-8 w-32" /></div>
                                </>
                            ) : (
                                <>
                                    <div className="p-4">
                                        <p className="text-sm text-muted-foreground">Impressions</p>
                                        <p className="text-2xl font-bold">{stats.impressions}</p>
                                    </div>
                                    <div className="p-4">
                                        <p className="text-sm text-muted-foreground">Clicks</p>
                                        <p className="text-2xl font-bold">{stats.clicks}</p>
                                    </div>
                                    <div className="p-4">
                                        <p className="text-sm text-muted-foreground">Revenue generated</p>
                                        <p className="text-2xl font-bold">{stats.revenue}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div>
                <h2 className="text-xl font-semibold tracking-tight mb-4">All automations</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {loading ? (
                        Array.from({length: 6}).map((_, i) => <Skeleton key={i} className="h-[260px] w-full" />)
                    ) : (
                        automations.map((automation) => (
                            <Card key={automation.title}>
                                <CardHeader>
                                    <div className="flex items-start gap-4">
                                        <div className="bg-muted p-3 rounded-lg">
                                            <automation.icon className="h-6 w-6 text-primary" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <CardTitle>{automation.title}</CardTitle>
                                                <Badge variant={automation.status === 'Active' ? 'default' : 'secondary'}>{automation.status}</Badge>
                                                 {automation.isLocked && <Badge variant="outline">Premium</Badge>}
                                            </div>
                                            <CardDescription className="mt-1">{automation.description}</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-3 gap-4 text-center">
                                        <div>
                                            <p className="font-bold text-lg">{automation.stats.impressions}</p>
                                            <p className="text-xs text-muted-foreground">Impressions</p>
                                        </div>
                                        <div>
                                            <p className="font-bold text-lg">{automation.stats.clicks}</p>
                                            <p className="text-xs text-muted-foreground">Clicks</p>
                                        </div>
                                        <div>
                                            <p className="font-bold text-lg">{automation.stats.revenue}</p>
                                            <p className="text-xs text-muted-foreground">Revenue</p>
                                        </div>
                                    </div>
                                </CardContent>
                                <Separator />
                                <CardFooter className="flex justify-between items-center py-3 px-6">
                                    {automation.isLocked ? (
                                        <>
                                            <Button variant="outline" size="sm" asChild>
                                                <Link href={`/automations/${automation.id}`}>
                                                    View Flow <ArrowRight className="ml-2 h-4 w-4" />
                                                </Link>
                                            </Button>
                                            <Button size="sm">
                                                <Lock className="mr-2 h-4 w-4" />
                                                Unlock
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <Button 
                                                    variant={automation.status === 'Active' ? 'destructive' : 'default'} 
                                                    size="sm"
                                                    onClick={() => handleToggleStatus(automation.id)}
                                                >
                                                    {automation.status === 'Active' ? 'Deactivate' : 'Activate'}
                                                </Button>
                                                 <Button variant="outline" size="sm" asChild>
                                                    <Link href={`/automations/${automation.id}`}>
                                                        View Flow <ArrowRight className="ml-2 h-4 w-4" />
                                                    </Link>
                                                </Button>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                {automation.status === 'Active' ? 'Activated' : 'Inactive'}.
                                            </p>
                                        </>
                                    )}
                                </CardFooter>
                            </Card>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
