
'use client';
import { ReactNode } from 'react';
import { CampaignStateProvider } from '@/context/campaign-context';
import { CampaignWizardBootstrap } from '@/components/campaigns/campaign-wizard-bootstrap';

export default function NewCampaignLayout({ children }: { children: ReactNode }) {
    return (
        <CampaignStateProvider>
            <CampaignWizardBootstrap />
            {children}
        </CampaignStateProvider>
    );
}
