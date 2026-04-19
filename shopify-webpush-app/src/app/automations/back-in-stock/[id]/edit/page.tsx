
'use client';

import React, { useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { AutomationComposer } from '@/components/automations/automation-composer';
import { Skeleton } from '@/components/ui/skeleton';
import { useAutomationState } from '@/context/automation-context';
import { useSettings } from '@/context/settings-context';

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

export default function EditBackInStockStepPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const stepId = params.id as string;
    const { shopDomain: settingsShop } = useSettings();
    const { initializeState, isInitialized } = useAutomationState();

    const shopDomain = useMemo(() => {
        return searchParams.get('shop') || settingsShop || '';
    }, [searchParams, settingsShop]);

    useEffect(() => {
        if (!stepId || !shopDomain || isInitialized) {
            return;
        }

        fetch('/api/automations/rules?shop=' + encodeURIComponent(shopDomain))
            .then((res) => res.json())
            .then((payload) => {
                if (!payload?.ok) {
                    return;
                }

                const rule = (payload.rules ?? []).find((item: { ruleKey: string }) => item.ruleKey === 'back_in_stock');
                const step = (rule?.config?.steps?.[stepId] ?? null) as
                    | {
                            title?: string;
                            body?: string;
                            targetUrl?: string | null;
                            iconUrl?: string | null;
                            imageUrl?: string | null;
                            windowsImageUrl?: string | null;
                            macosImageUrl?: string | null;
                            androidImageUrl?: string | null;
                            actionButtons?: Array<{ title: string; link: string }>;
                        }
                    | null;

                if (!step) {
                    return;
                }

                initializeState({
                    notification: {
                        title: step.title ?? '',
                        message: step.body ?? '',
                        iconUrl: step.iconUrl ?? null,
                        heroUrl: step.imageUrl ?? null,
                        windowsHeroUrl: step.windowsImageUrl ?? null,
                        macHeroUrl: step.macosImageUrl ?? null,
                        androidHeroUrl: step.androidImageUrl ?? null,
                        actionButtons: step.actionButtons ?? [],
                        targetUrl: step.targetUrl ?? '',
                    },
                });
            })
            .catch(() => undefined);
    }, [stepId, shopDomain, initializeState, isInitialized]);

    if (!isInitialized) {
        return <ComposerSkeleton />;
    }

    return (
        <AutomationComposer
            automationPath="/automations/back-in-stock"
            automationRuleKey="back_in_stock"
        />
    );
}
