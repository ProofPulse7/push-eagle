'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { AutomationComposerSkeleton } from '@/components/automations/automation-composer-skeleton';
import { AppLegalFooter } from './app-legal-footer';
import { GlobalLoadingProvider } from '@/components/providers/global-loading-provider';
import { MainRouteContent } from './main-route-content';
import { Sidebar } from './sidebar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  const isCampaignComposerFullscreen =
    pathname.startsWith('/campaigns/new/editor') ||
    pathname.startsWith('/campaigns/new/schedule');
  const isLoginPage = pathname.startsWith('/login');
  const isMarketingPage =
    pathname === '/' || pathname.startsWith('/privacy') || pathname.startsWith('/terms');
  const isAutomationEditor = /^\/automations\/[a-zA-Z0-9-]+\/[^/]+\/edit$/.test(pathname);

  if (isMarketingPage || isCampaignComposerFullscreen || isAutomationEditor || isLoginPage) {
    return (
      <main className="flex-grow bg-background">
        {isAutomationEditor ? (
          <Suspense fallback={<AutomationComposerSkeleton />}>{children}</Suspense>
        ) : (
          children
        )}
      </main>
    );
  }

  return (
    <GlobalLoadingProvider>
      <div className="min-h-screen w-full bg-background">
        <Sidebar />
        <div className="flex min-h-screen flex-col bg-background md:pl-64">
          <main className="flex flex-1 flex-col bg-background">
            <MainRouteContent>{children}</MainRouteContent>
            <AppLegalFooter />
          </main>
        </div>
      </div>
    </GlobalLoadingProvider>
  );
}
