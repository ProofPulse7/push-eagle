
'use client';

import React, { useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { AutomationComposer } from '@/components/automations/automation-composer';
import { AutomationComposerSkeleton } from '@/components/automations/automation-composer-skeleton';
import { useAutomationState } from '@/context/automation-context';
import { useSettings } from '@/context/settings-context';

export default function EditPriceDropStepPage() {
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

                const rule = (payload.rules ?? []).find((item: { ruleKey: string }) => item.ruleKey === 'price_drop');
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
        return <AutomationComposerSkeleton />;
    }

    return (
        <AutomationComposer
            automationPath="/automations/price-drop"
            automationRuleKey="price_drop"
        />
    );
}
