
'use client';

import Link from 'next/link';
import {
  Settings,
  Plus,
  LayoutGrid,
  Megaphone,
  Users,
  ShoppingCart,
  PieChart,
  MonitorCheck,
  Tag,
  BarChart,
  LogIn,
} from 'lucide-react';
import { NavLink } from './nav-link';
import { Button } from '../ui/button';

const NavLogo = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
    </svg>
);


export function MobileSidebar() {
  return (
    <div className="flex h-full max-h-screen flex-col bg-card text-card-foreground">
       <div className="flex h-16 shrink-0 items-center border-b px-6">
            <Link href="/dashboard" className="flex items-center gap-3 font-semibold text-lg text-foreground">
                <NavLogo className="h-7 w-7 text-primary" />
                <span className="">Push Eagle</span>
            </Link>
        </div>

      <div className="flex-1 overflow-auto p-4">
        <Button asChild className="w-full">
            <Link href="/campaigns/new">
                <Plus className="h-4 w-4" />
                New Campaign
            </Link>
        </Button>
        <nav className="grid items-start gap-1 text-base font-medium mt-4">
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
            <NavLink href="/plans" icon={Tag}>
                Plans
            </NavLink>
            <NavLink href="/settings" icon={Settings}>
                Settings
            </NavLink>
            <NavLink href="/login" icon={LogIn}>
                Login
            </NavLink>
        </nav>
      </div>
    </div>
  );
}

    