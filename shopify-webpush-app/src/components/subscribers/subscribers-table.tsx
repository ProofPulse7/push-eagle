
'use client';

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils";
import { ChevronsUpDown } from "lucide-react";

type Subscriber = {
    id: number;
    name: string;
    createdAt: string;
    browser: string;
    os: string;
    device: string;
    location: string;
};

const allSubscribersData: Subscriber[] = [
    { id: 414880337, name: 'Anonymous', createdAt: 'Jun 19, 2025, 5:03:34 AM', browser: 'chrome', os: 'Android', device: 'mobile', location: 'Karachi, Pakistan' },
    { id: 414816110, name: 'Anonymous', createdAt: 'Jun 18, 2025, 8:19:22 PM', browser: 'chrome', os: 'Windows 10', device: 'pc', location: 'Karachi, Pakistan' },
    { id: 414815562, name: 'Anonymous', createdAt: 'Jun 18, 2025, 8:16:08 PM', browser: 'chrome', os: 'Windows 10', device: 'pc', location: 'Karachi, Pakistan' },
    { id: 411786046, name: 'Anonymous', createdAt: 'May 30, 2025, 3:12:08 AM', browser: 'chrome', os: 'Android', device: 'mobile', location: 'Karachi, Pakistan' },
    { id: 407234357, name: 'Anonymous', createdAt: 'May 2, 2025, 3:52:52 AM', browser: 'chrome', os: 'Android', device: 'mobile', location: 'Karachi, Pakistan' },
    { id: 407232711, name: 'Anonymous', createdAt: 'May 2, 2025, 3:33:11 AM', browser: 'chrome', os: 'Windows 10', device: 'pc', location: 'Karachi, Pakistan' },
    ...Array.from({ length: 50 }, (_, i) => ({
        id: 407232711 + i + 1,
        name: 'Anonymous',
        createdAt: `May ${Math.floor(Math.random() * 30) + 1}, 2025, 3:33:11 AM`,
        browser: ['chrome', 'firefox', 'safari'][Math.floor(Math.random() * 3)],
        os: ['Windows 10', 'Android', 'macOS'][Math.floor(Math.random() * 3)],
        device: ['pc', 'mobile'][Math.floor(Math.random() * 2)],
        location: 'Karachi, Pakistan'
    }))
];

export function SubscribersTable() {
    const [visibleCount, setVisibleCount] = useState(50);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const sortedSubscribers = useMemo(() => {
        return [...allSubscribersData].sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
    }, [sortOrder]);

    const loadMore = () => {
        setVisibleCount(prevCount => prevCount + 50);
    };

    const toggleSortOrder = () => {
        setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
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
                    {sortedSubscribers.slice(0, visibleCount).map((subscriber, index) => (
                        <TableRow key={subscriber.id} className={cn(index % 2 === 0 ? 'bg-card' : 'bg-muted/50')}>
                            <TableCell className="font-medium">{subscriber.name}</TableCell>
                            <TableCell>{subscriber.id}</TableCell>
                            <TableCell>{subscriber.createdAt}</TableCell>
                            <TableCell>{subscriber.browser}</TableCell>
                            <TableCell>{subscriber.os}</TableCell>
                            <TableCell>{subscriber.device}</TableCell>
                            <TableCell>{subscriber.location}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {visibleCount < allSubscribersData.length && (
                <div className="text-center mt-4">
                    <Button onClick={loadMore}>Load More</Button>
                </div>
            )}
        </div>
    );
}
