'use client';

import { useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import { AutomationComposer } from '@/components/automations/automation-composer';
import { AutomationComposerSkeleton } from '@/components/automations/automation-composer-skeleton';
import { useAutomationEditorInit } from '@/hooks/use-automation-editor-init';
import { useSettings } from '@/context/settings-context';

export default function EditShippingNotificationStepPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const stepId = params.id as string;
  const { shopDomain: settingsShop } = useSettings();
  const shopDomain = useMemo(
    () => searchParams.get('shop') || settingsShop || '',
    [searchParams, settingsShop],
  );

  const { isInitialized } = useAutomationEditorInit({
    shopDomain,
    ruleKey: 'shipping_notifications',
    stepId,
  });

  if (!isInitialized) {
    return <AutomationComposerSkeleton />;
  }

  return (
    <AutomationComposer
      automationPath="/automations/shipping-notifications"
      automationRuleKey="shipping_notifications"
    />
  );
}
