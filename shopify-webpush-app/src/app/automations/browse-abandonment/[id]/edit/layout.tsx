'use client';

import { ReactNode, Suspense } from 'react';

import { AutomationComposerSkeleton } from '@/components/automations/automation-composer-skeleton';
import { AutomationStateProvider } from '@/context/automation-context';

export default function EditAutomationStepLayout({ children }: { children: ReactNode }) {
  return (
    <AutomationStateProvider>
      <Suspense fallback={<AutomationComposerSkeleton />}>
        {children}
      </Suspense>
    </AutomationStateProvider>
  );
}
