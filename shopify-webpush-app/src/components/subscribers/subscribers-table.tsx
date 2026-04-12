
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronsUpDown } from 'lucide-react';
import { useSettings } from '@/context/settings-context';

type Subscriber = {
    subscriber: string;
    subscriberId: string;
    createdAt: string;
    webBrowser: string;
    os: string;
    deviceUsed: string;
    cityCountry: string;
};

export function SubscribersTable() {
    const { shopDomain } = useSettings();
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const pageSize = 100;

    useEffect(() => {
        if (!shopDomain) {
            return;
        }

        let active = true;
        setLoading(true);

        fetch(`/api/subscribers/list?shop=${encodeURIComponent(shopDomain)}&limit=${pageSize}&offset=0&sort=${sortOrder}`)
            .then((response) => response.json())
            .then((data) => {
                if (!active || !data?.ok) {
                    return;
                }
                setSubscribers(Array.isArray(data.subscribers) ? data.subscribers : []);
                setOffset(Array.isArray(data.subscribers) ? data.subscribers.length : 0);
                setHasMore(Boolean(data.hasMore));
            })
            .catch(() => undefined)
            .finally(() => {
                if (active) {
                    setLoading(false);
                }
            });

        return () => {
            active = false;
        };
    }, [shopDomain, sortOrder]);

    const visibleSubscribers = useMemo(() => {
        return subscribers.map((subscriber) => ({
            ...subscriber,
            createdAt: subscriber.createdAt
                ? new Date(subscriber.createdAt).toLocaleString()
                : 'Unknown',
        }));
    }, [subscribers]);

    const loadMore = async () => {
        if (!shopDomain || !hasMore || loadingMore) {
            return;
        }

        setLoadingMore(true);
        try {
            const response = await fetch(`/api/subscribers/list?shop=${encodeURIComponent(shopDomain)}&limit=${pageSize}&offset=${offset}&sort=${sortOrder}`);
            const data = await response.json();
            if (!data?.ok) {
                return;
            }

            const nextRows = Array.isArray(data.subscribers) ? data.subscribers : [];
            setSubscribers((prev) => [...prev, ...nextRows]);
            setOffset((prev) => prev + nextRows.length);
            setHasMore(Boolean(data.hasMore));
        } catch (_error) {
            // Keep the current list if load-more fails.
        } finally {
            setLoadingMore(false);
        }
    };

    const toggleSortOrder = () => {
        setSortOrder((prevOrder) => (prevOrder === 'asc' ? 'desc' : 'asc'));
    };

    return (
        <div>
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted border-b hover:bg-muted">
                        <TableHead className="font-bold text-base py-4 text-foreground">Subscriber</TableHead>
                        <TableHead className="font-bold text-base py-4 text-foreground">Subscriber ID</TableHead>
                        <TableHead className="font-bold text-base py-4 text-foreground">
                            <Button variant="ghost" onClick={toggleSortOrder} className="px-0 hover:bg-transparent text-base text-foreground font-bold hover:text-foreground">
                                Subscriber created at
                                <ChevronsUpDown className="ml-2 h-4 w-4" />
                            </Button>
                        </TableHead>
                        <TableHead className="font-bold text-base py-4 text-foreground">Web browser</TableHead>
                        <TableHead className="font-bold text-base py-4 text-foreground">OS</TableHead>
                        <TableHead className="font-bold text-base py-4 text-foreground">Device used</TableHead>
                        <TableHead className="font-bold text-base py-4 text-foreground">City/Country</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {visibleSubscribers.map((subscriber, index) => (
                        <TableRow key={`${subscriber.subscriberId}-${index}`} className={cn(index % 2 === 0 ? 'bg-card' : 'bg-muted/50')}>
                            <TableCell className="font-medium">{subscriber.subscriber}</TableCell>
                            <TableCell>{subscriber.subscriberId}</TableCell>
                            <TableCell>{subscriber.createdAt}</TableCell>
                            <TableCell>{subscriber.webBrowser}</TableCell>
                            <TableCell>{subscriber.os}</TableCell>
                            <TableCell>{subscriber.deviceUsed}</TableCell>
                            <TableCell>{subscriber.cityCountry}</TableCell>
                        </TableRow>
                    ))}
                    {!loading && visibleSubscribers.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                No subscribers yet.
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            <div className="text-center mt-4">
                {hasMore && (
                    <Button onClick={loadMore} disabled={loadingMore}>
                        {loadingMore ? 'Loading...' : 'Load More'}
                    </Button>
                )}
                {loading && <p className="text-sm text-muted-foreground">Loading subscribers...</p>}
            </div>
        </div>
    );
}
