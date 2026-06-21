
'use client';
import { ReactNode, Suspense } from 'react';
import { CampaignStateProvider } from '@/context/campaign-context';
export default function NewCampaignLayout({ children }: { children: ReactNode }) {
    return (
        <Suspense fallback={children}>
            <CampaignStateProvider>{children}</CampaignStateProvider>
        </Suspense>
    );
}
