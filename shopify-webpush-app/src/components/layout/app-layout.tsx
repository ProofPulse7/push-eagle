'use client';

import { usePathname } from 'next/navigation';
import { AppLegalFooter } from './app-legal-footer';
import { Sidebar } from './sidebar';
import { ThemeExtensionWarningBanner } from '@/components/dashboard/theme-extension-warning-banner';
import { useShopDomain } from '@/hooks/use-shop-domain';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const shopDomain = useShopDomain();
  
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
    <div className="min-h-screen w-full">
      <Sidebar />
      <div className="flex flex-col md:pl-64">
        <main className="flex-grow pe-page-enter">
          {shopDomain ? (
            <div className="px-4 pt-4 sm:px-6 md:px-8">
              <ThemeExtensionWarningBanner />
            </div>
          ) : null}
          {children}
          <AppLegalFooter />
        </main>
      </div>
    </div>
  );
}
