
'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAutomationState } from '@/context/automation-context';
import { BrowseAbandonmentComposer } from '@/components/automations/browse-abandonment-composer';
import { Skeleton } from '@/components/ui/skeleton';

// Mock data, mirroring the structure from the flow page
const flowData = {
    notifications: [
        {
            id: 'browse-reminder-1',
            title: "Reminder 1",
            notification: {
                title: "Still interested in this?",
                message: "We noticed you were looking at some of our products. Take another look!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null,
                siteName: "chrome.zahoorshop.com",
                actionButtons: [{title: 'View Product', link: '#'}, {title: '', link: ''}]
            }
        },
        {
            id: 'browse-reminder-2',
            title: "Reminder 2",
            notification: {
                title: "{{product_name}}",
                message: "And many more products available!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null,
                siteName: "push-eagle-test1.myshopify.com",
                actionButtons: [{title: 'View Product', link: '#'}, {title: 'Continue Shopping', link: 'https://push-eagle-test1.myshopify.com/products'}]
            }
        },
        {
            id: 'browse-reminder-3',
            title: "Reminder 3",
            notification: {
                title: "Don't let it get away!",
                message: "The product you viewed is getting a lot of attention. Secure yours before it's gone.",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null,
                siteName: "chrome.zahoorshop.com",
                actionButtons: [{title: 'View Product', link: '#'}, {title: 'Continue Shopping', link: 'https://chrome.zahoorshop.com/products'}]
            }
        }
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


export default function EditBrowseAbandonmentStepPage() {
    const params = useParams();
    const stepId = params.id as string;
    const { initializeState, isInitialized } = useAutomationState();

    const stepData = flowData.notifications.find(n => n.id === stepId);

    useEffect(() => {
        if (stepId && !isInitialized) {
            if (stepData) {
                initializeState(stepData);
            }
        }
    }, [stepId, initializeState, isInitialized, stepData]);

    if (!isInitialized) {
        return <ComposerSkeleton />;
    }

    return <BrowseAbandonmentComposer reminderTitle={stepData?.title || ''} />;
}
