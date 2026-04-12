
'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export function NavLink({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: React.ReactNode; }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  let isActive = pathname.startsWith(href);
  if (href === '/dashboard') {
    isActive = pathname === href;
  }
  if (href === '/campaigns' && pathname.startsWith('/campaigns/new')) {
      isActive = false;
  }

  const preservedParams = new URLSearchParams();
  const shop = searchParams.get('shop');
  const host = searchParams.get('host');
  if (shop) {
    preservedParams.set('shop', shop);
  }
  if (host) {
    preservedParams.set('host', host);
  }
  const targetHref = preservedParams.toString() ? `${href}?${preservedParams.toString()}` : href;
  
  return (
    <Link
      href={targetHref}
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
