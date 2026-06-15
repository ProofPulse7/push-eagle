
'use client';

import { usePathname } from 'next/navigation';
import { AppLegalFooter } from './app-legal-footer';
import { TopNav } from './top-nav';

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
    return <main className="flex-grow bg-background">{children}</main>;
  }

  return (
    <div className="min-h-screen w-full bg-background">
      <TopNav />
      <main className="flex-grow pe-page-enter">
        {children}
        <AppLegalFooter />
      </main>
    </div>
  );
}
