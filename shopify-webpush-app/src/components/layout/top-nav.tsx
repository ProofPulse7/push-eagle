'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useImpressionLimit } from '@/hooks/use-impression-limit';
import { withShopifyAdminContext } from '@/lib/client/shopify-admin-context';
import { PRIMARY_NAV_ITEMS, SECONDARY_NAV_ITEMS } from './nav-items';
import { TopNavLink } from './top-nav-link';

const NavLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);

export function TopNav() {
  const { atLimit } = useImpressionLimit();
  const newCampaignHref = withShopifyAdminContext(atLimit ? '/plans' : '/campaigns/new/details');
  const dashboardHref = withShopifyAdminContext('/dashboard');

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-4 md:px-6">
        <Link
          href={dashboardHref}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg px-2 py-1 font-semibold text-foreground"
        >
          <NavLogo className="h-6 w-6 text-primary" />
          <span className="hidden sm:inline">Push Eagle</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PRIMARY_NAV_ITEMS.map((item) => (
            <TopNavLink key={item.href} item={item} />
          ))}
          <span className="mx-1 hidden h-5 w-px shrink-0 bg-border md:inline" />
          {SECONDARY_NAV_ITEMS.map((item) => (
            <TopNavLink key={item.href} item={item} />
          ))}
        </nav>

        <Button asChild size="sm" className="shrink-0 pe-pressable" disabled={atLimit}>
          <Link href={newCampaignHref}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{atLimit ? 'Upgrade' : 'New Campaign'}</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
