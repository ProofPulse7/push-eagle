'use client';

import React, { useEffect, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { AbandonedCartComposer } from '@/components/automations/abandoned-cart-composer';
import { AutomationComposerSkeleton } from '@/components/automations/automation-composer-skeleton';
import { useAutomationState } from '@/context/automation-context';
import { useSettings } from '@/context/settings-context';

const REMINDER_TITLES: Record<string, string> = {
  'cart-reminder-1': 'Reminder 1',
  'cart-reminder-2': 'Reminder 2',
  'cart-reminder-3': 'Reminder 3',
};

export default function EditAbandonedCartStepPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const stepId = params.id as string;
  const { shopDomain: settingsShop } = useSettings();
  const { initializeState, isInitialized } = useAutomationState();

  const shopDomain = useMemo(() => {
    return searchParams.get('shop') || settingsShop || '';
  }, [searchParams, settingsShop]);

  const reminderTitle = REMINDER_TITLES[stepId] ?? 'Reminder';

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

        const rule = (payload.rules ?? []).find((item: { ruleKey: string }) => item.ruleKey === 'cart_abandonment_30m');
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

        const cartTargetUrl = step.targetUrl ?? '/cart';
        const actionButtons = (step.actionButtons ?? []).map((button, index) => (
          index === 0
            ? { ...button, link: cartTargetUrl }
            : button
        ));

        initializeState({
          notification: {
            title: step.title ?? '',
            message: step.body ?? '',
            iconUrl: step.iconUrl ?? null,
            heroUrl: null,
            windowsHeroUrl: null,
            macHeroUrl: null,
            androidHeroUrl: null,
            actionButtons,
            targetUrl: cartTargetUrl,
          },
        });
      })
      .catch(() => undefined);
  }, [stepId, shopDomain, initializeState, isInitialized]);

  if (!isInitialized) {
    return <AutomationComposerSkeleton />;
  }

  return <AbandonedCartComposer reminderTitle={reminderTitle} />;
}
