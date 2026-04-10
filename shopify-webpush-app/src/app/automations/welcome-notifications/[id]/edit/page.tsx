
'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAutomationState } from '@/context/automation-context';
import { AutomationComposer } from '@/components/automations/automation-composer';
import { Skeleton } from '@/components/ui/skeleton';

// Mock data, mirroring the structure from the flow page
const flowData = {
    notifications: [
        {
            id: 'reminder-1',
            title: "Reminder 1",
            delay: "0 minutes",
            status: 'Inactive',
            notification: {
                title: "You are subscribed",
                message: "We will keep you posted with latest updates.",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null, // No image for the first one
                siteName: "chrome.zahoorshop.com",
                actionButtons: []
            }
        },
        {
            id: 'reminder-2',
            title: "Reminder 2",
            delay: "2 hours",
            status: 'Inactive',
            notification: {
                title: "We're glad to have you here! ❤️",
                message: "As an exclusive subscriber, you'll get our latest offers and products before anyone else!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: "https://placehold.co/728x360.png",
                siteName: "chrome.zahoorshop.com",
                actionButtons: [{title: 'Shop Now', link: 'https://example.com/shop'}]
            }
        },
        {
            id: 'reminder-3',
            title: "Reminder 3",
            delay: "1 day",
            status: 'Inactive',
            notification: {
                title: "Hey there! 👋 Anything specific caught your eye?",
                message: "Our products are made with care, giving you the best!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: "https://placehold.co/728x360.png",
                siteName: "chrome.zahoorshop.com",
                actionButtons: [{title: 'View Products', link: 'https://example.com/products'}, {title: 'Special Offers', link: 'https://example.com/offers'}]
            }
        },
    ]
}

const ComposerSkeleton = () => (
    <div className="h-screen w-full grid grid-cols-1 lg:grid-cols-[minmax(0,_480px)_1fr]">
        <div className="bg-card border-r flex flex-col h-screen">
             <div className="p-4 border-b shrink-0"><Skeleton className="h-8 w-48" /></div>
             <div className="p-4 space-y-8">
                <div className="space-y-2"><Skeleton className="h-6 w-32" /><Skeleton className="h-10 w-full" /></div>
                <div className="space-y-2"><Skeleton className="h-6 w-32" /><Skeleton className="h-20 w-full" /></div>
                <div className="space-y-2"><Skeleton className="h-6 w-32" /><Skeleton className="h-10 w-full" /></div>
             </div>
        </div>
        <div className="h-screen bg-background flex items-center justify-center">
            <Skeleton className="h-1/2 w-1/2"/>
        </div>
    </div>
)


export default function EditAutomationStepPage() {
    const params = useParams();
    const stepId = params.id as string;
    const { initializeState, isInitialized } = useAutomationState();

    useEffect(() => {
        if (stepId && !isInitialized) {
            // In a real app, you would fetch this data from your database.
            // For now, we find it in our mock data.
            const stepData = flowData.notifications.find(n => n.id === stepId);
            if (stepData) {
                initializeState(stepData);
            }
        }
    }, [stepId, initializeState, isInitialized]);

    if (!isInitialized) {
        return <ComposerSkeleton />;
    }

    return <AutomationComposer />;
}
