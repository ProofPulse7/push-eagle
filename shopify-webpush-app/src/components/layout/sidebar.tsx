
'use client';

import Link from 'next/link';
import {
  LayoutGrid,
  Send,
  Users,
  Settings,
  PieChart,
  Users2,
  ShoppingCart,
  MonitorCheck,
  Tag,
  Plus,
  Bell,
  Megaphone,
  BarChart,
  LogIn,
  Stethoscope,
} from 'lucide-react';
import { NavLink } from './nav-link';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';


const NavLogo = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
    </svg>
);


export function Sidebar() {
    const currentParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const preservedParams = new URLSearchParams();
    const shop = currentParams.get('shop');
    const host = currentParams.get('host');
    if (shop) {
        preservedParams.set('shop', shop);
    }
    if (host) {
        preservedParams.set('host', host);
    }
    const withContext = (path: string) => (preservedParams.toString() ? `${path}?${preservedParams.toString()}` : path);

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-full w-64 flex-col border-r bg-card text-card-foreground md:flex rounded-r-3xl shadow-xl">
      <div className="flex h-16 shrink-0 items-center px-6">
                <Link href={withContext('/dashboard')} className="flex items-center gap-3 font-semibold text-lg text-foreground">
            <NavLogo className="h-7 w-7 text-primary" />
            <span className="">Push Eagle</span>
        </Link>
      </div>
      
      <div className="flex flex-1 flex-col overflow-y-auto p-4 gap-4">
        <Button asChild>
            <Link href={withContext('/campaigns/new')}>
                <Plus className="h-4 w-4" />
                New Campaign
            </Link>
        </Button>
        <nav className="flex-1 space-y-1">
            <NavLink href="/dashboard" icon={LayoutGrid}>
              Dashboard
            </NavLink>
            <NavLink href="/campaigns" icon={Megaphone}>
                Campaigns
            </NavLink>
            <NavLink href="/subscribers" icon={Users}>
                Subscribers
            </NavLink>
            <NavLink href="/automations" icon={ShoppingCart}>
                Automation
            </NavLink>
             <NavLink href="/analytics" icon={BarChart}>
                Analytics
            </NavLink>
            <NavLink href="/segments" icon={PieChart}>
                Segments
            </NavLink>
            <NavLink href="/opt-ins" icon={MonitorCheck}>
                Opt-ins
            </NavLink>
        </nav>

        <div className="mt-auto space-y-1">
             <NavLink href="/plans" icon={Tag}>
                Plans
            </NavLink>
            <NavLink href="/diagnostics" icon={Stethoscope}>
                Diagnostics
            </NavLink>
            <NavLink href="/settings" icon={Settings}>
                Settings
            </NavLink>
            <NavLink href="/login" icon={LogIn}>
                Login
            </NavLink>
        </div>
      </div>
    </aside>
  );
}

    