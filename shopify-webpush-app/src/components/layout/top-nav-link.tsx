'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { prefetchShopQueries } from '@/hooks/queries/use-app-queries';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { withShopifyAdminContext } from '@/lib/client/shopify-admin-context';
import { cn } from '@/lib/utils';
import type { AppNavItem } from './nav-items';

export function TopNavLink({ item }: { item: AppNavItem }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const shopDomain = useShopDomain();

  let isActive =
    item.match === 'exact' ? pathname === item.href : pathname.startsWith(item.href);

  if (item.href === '/campaigns' && pathname.startsWith('/campaigns/new')) {
    isActive = false;
  }

  const targetHref = withShopifyAdminContext(item.href);

  return (
    <Link
      href={targetHref}
      onMouseEnter={() => prefetchShopQueries(queryClient, shopDomain)}
      onFocus={() => prefetchShopQueries(queryClient, shopDomain)}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary',
        isActive && 'bg-primary/10 text-primary',
      )}
    >
      <item.icon className="h-4 w-4" />
      <span>{item.label}</span>
    </Link>
  );
}
