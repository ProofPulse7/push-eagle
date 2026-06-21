
'use client';
import { ReactNode, Suspense } from 'react';
import { CampaignStateProvider } from '@/context/campaign-context';
import { PageLoadingShell } from '@/components/ui/loading-ui';

export default function NewCampaignLayout({ children }: { children: ReactNode }) {
    return (
        <Suspense fallback={<PageLoadingShell />}>
            <CampaignStateProvider>{children}</CampaignStateProvider>
        </Suspense>
    );
}
