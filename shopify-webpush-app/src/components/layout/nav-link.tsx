
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { prefetchShopQueries } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { withShopifyAdminContext } from '@/lib/client/shopify-admin-context';

export function NavLink({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: React.ReactNode; }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const shopDomain = useShopDomain();

  let isActive = pathname.startsWith(href);
  if (href === '/dashboard') {
    isActive = pathname === href;
  }
  if (href === '/campaigns' && pathname.startsWith('/campaigns/new')) {
      isActive = false;
  }

  const targetHref = withShopifyAdminContext(href);
  
  return (
    <Link
      href={targetHref}
      onMouseEnter={() => prefetchShopQueries(queryClient, shopDomain)}
      onFocus={() => prefetchShopQueries(queryClient, shopDomain)}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-all hover:text-primary hover:bg-primary/5",
        "transform-gpu transition-transform duration-200 ease-in-out hover:scale-[1.02]",
        isActive && "bg-primary/10 font-semibold text-primary"
      )}
    >
      <Icon className="h-5 w-5" />
      {children}
    </Link>
  );
}
