'use client';
import { ReactNode } from 'react';
import { AutomationStateProvider } from '@/context/automation-context';
export default function EditAutomationStepLayout({ children }: { children: ReactNode }) {
    return <AutomationStateProvider>{children}</AutomationStateProvider>;
}