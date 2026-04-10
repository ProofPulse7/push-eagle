
'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './sidebar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  const isCampaignComposer = pathname.startsWith('/campaigns/new');
  const isLoginPage = pathname.startsWith('/login');
  // This Regex checks for paths like /automations/{...}/some-id/edit
  const isAutomationEditor = /^\/automations\/[a-zA-Z0-9-]+\/[^/]+\/edit$/.test(pathname);

  // Render a minimal layout for composer-like pages
  if (isCampaignComposer || isAutomationEditor || isLoginPage) {
    return <main className="flex-grow bg-background">{children}</main>;
  }

  // Render the default layout with a sidebar for all other pages
  return (
    <div className="min-h-screen w-full">
      <Sidebar />
      <div className="flex flex-col md:pl-64">
        <main className="flex-grow">{children}</main>
      </div>
    </div>
  );
}
