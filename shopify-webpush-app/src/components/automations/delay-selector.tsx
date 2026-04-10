'use client';

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const delayOptions = [
    '0 minutes', '3 minutes', '5 minutes', '10 minutes', '15 minutes', 
    '20 minutes', '30 minutes', '1 hour', '2 hours', '4 hours', '6 hours',
    '12 hours', '1 day', '2 days', '3 days', '4 days', '7 days', '10 days',
    '15 days', '30 days'
];

export const DelaySelector = ({ currentDelay }: { currentDelay: string }) => {
    const [delay, setDelay] = useState(currentDelay);

    return (
         <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Select value={delay} onValueChange={setDelay}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                    <SelectValue placeholder="Set delay" />
                </SelectTrigger>
                <SelectContent>
                    {delayOptions.map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}
