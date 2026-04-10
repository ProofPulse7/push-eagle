'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAutomationState } from '@/context/automation-context';
import { ShippingNotificationComposer } from '@/components/automations/shipping-notification-composer';
import { Skeleton } from '@/components/ui/skeleton';

// Mock data, mirroring the structure from the flow page
const flowData = {
    notifications: [
        {
            id: 'shipping-1',
            title: "Shipping Confirmation",
            notification: {
                title: "Your order {{order_name}} has been shipped",
                message: "Click here to track your order",
                iconUrl: "https://placehold.co/48x48.png",
                heroUrl: null, // Shipping notifications usually don't have a hero image.
                siteName: "chrome.zahoorshop.com",
                actionButtons: [{title: 'Track Order', link: '#'}]
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


export default function EditShippingNotificationStepPage() {
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

    return <ShippingNotificationComposer />;
}
