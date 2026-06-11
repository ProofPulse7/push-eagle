
'use client';

import { useMemo, useState } from 'react';
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
import { useSubscribersList } from '@/hooks/queries/use-app-queries';

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
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const pageSize = 100;
    const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
        useSubscribersList(sortOrder, pageSize);

    const subscribers = useMemo(() => {
        if (!data?.pages) {
            return [] as Subscriber[];
        }

        return data.pages.flatMap((page) =>
            Array.isArray(page.subscribers) ? (page.subscribers as Subscriber[]) : [],
        );
    }, [data]);

    const visibleSubscribers = useMemo(() => {
        return subscribers.map((subscriber) => ({
            ...subscriber,
            createdAt: subscriber.createdAt
                ? new Date(subscriber.createdAt).toLocaleString()
                : 'Unknown',
        }));
    }, [subscribers]);

    const toggleSortOrder = () => {
        setSortOrder((prevOrder) => (prevOrder === 'asc' ? 'desc' : 'asc'));
    };

    const loading = isLoading && subscribers.length === 0;

    return (
        <div>
            <div className="max-h-[min(70vh,720px)] overflow-auto rounded-md border">
            <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
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
                        <TableRow
                            key={`${subscriber.subscriberId}-${index}`}
                            className={cn(index % 2 === 0 ? 'bg-card' : 'bg-muted/50')}
                            style={{ contentVisibility: 'auto', containIntrinsicSize: '0 52px' }}
                        >
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
            </div>
            <div className="text-center mt-4">
                {hasNextPage && (
                    <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                        {isFetchingNextPage ? 'Loading...' : 'Load More'}
                    </Button>
                )}
                {loading && <p className="text-sm text-muted-foreground">Loading subscribers...</p>}
            </div>
        </div>
    );
}
