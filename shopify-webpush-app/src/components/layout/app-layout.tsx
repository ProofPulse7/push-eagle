
'use client';

import { usePathname } from 'next/navigation';
import { AppLegalFooter } from './app-legal-footer';
import { Sidebar } from './sidebar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  const isCampaignComposer = pathname.startsWith('/campaigns/new');
  const isLoginPage = pathname.startsWith('/login');
  const isAutomationEditor = /^\/automations\/[a-zA-Z0-9-]+\/[^/]+\/edit$/.test(pathname);

  if (isCampaignComposer || isAutomationEditor || isLoginPage) {
    return <main className="flex-grow bg-background">{children}</main>;
  }

  return (
    <div className="min-h-screen w-full">
      <Sidebar />
      <div className="flex flex-col md:pl-64">
        <main className="flex-grow pe-page-enter">
          {children}
          <AppLegalFooter />
        </main>
      </div>
    </div>
  );
}
