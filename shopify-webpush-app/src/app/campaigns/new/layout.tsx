
'use client';
import { ReactNode } from 'react';
import { CampaignStateProvider } from '@/context/campaign-context';
export default function NewCampaignLayout({ children }: { children: ReactNode }) {
    return <CampaignStateProvider>{children}</CampaignStateProvider>;
}
