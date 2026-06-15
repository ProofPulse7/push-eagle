import type { LucideIcon } from 'lucide-react';
import {
  LayoutGrid,
  Megaphone,
  MonitorCheck,
  PieChart,
  Settings,
  ShoppingCart,
  Tag,
  Users,
} from 'lucide-react';

export type AppNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: 'exact' | 'prefix';
  hideWhenComposerActive?: boolean;
};

export const PRIMARY_NAV_ITEMS: AppNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutGrid, match: 'exact' },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone, hideWhenComposerActive: true },
  { href: '/subscribers', label: 'Subscribers', icon: Users },
  { href: '/automations', label: 'Automation', icon: ShoppingCart },
  { href: '/segments', label: 'Segments', icon: PieChart },
  { href: '/opt-ins', label: 'Opt-ins', icon: MonitorCheck },
];

export const SECONDARY_NAV_ITEMS: AppNavItem[] = [
  { href: '/plans', label: 'Plans', icon: Tag },
  { href: '/settings', label: 'Settings', icon: Settings },
];
