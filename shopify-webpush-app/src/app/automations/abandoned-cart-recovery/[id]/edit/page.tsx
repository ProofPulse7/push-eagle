
'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAutomationState } from '@/context/automation-context';
import { AbandonedCartComposer } from '@/components/automations/abandoned-cart-composer';
import { Skeleton } from '@/components/ui/skeleton';

// Mock data, mirroring the structure from the flow page
const flowData = {
    notifications: [
        {
            id: 'cart-reminder-1',
            title: "Reminder 1",
            notification: {
                title: "We've saved your cart for you",
                message: "Buy them now before they get out of stock.",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null,
                actionButtons: [{title: 'Checkout', link: '#'}, {title: 'Continue Shopping', link: '#'}]
            }
        },
        {
            id: 'cart-reminder-2',
            title: "Reminder 2",
            notification: {
                title: "Still thinking it over?",
                message: "Your cart is waiting for you. Complete your purchase now and get free shipping on all orders!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null,
                actionButtons: [{title: 'Checkout', link: '#'}]
            }
        },
        {
            id: 'cart-reminder-3',
            title: "Reminder 3",
            notification: {
                title: "Don't miss out!",
                message: "The items in your cart are popular and might sell out soon. Grab them before they're gone!",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null,
                actionButtons: [{title: 'Complete Purchase', link: '#'}]
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


export default function EditAbandonedCartStepPage() {
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

    return <AbandonedCartComposer reminderTitle={stepData?.title || ''} />;
}
