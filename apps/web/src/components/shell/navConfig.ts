import type { ComponentType } from 'react';
import { Calendar, ChartNoAxesColumn, LayoutDashboard, LayoutList, Link2, MessageSquare, Package, Video, Zap } from 'lucide-react';

export interface NavItem {
  to: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  exact?: boolean;
}

export const NAV_SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Work', items: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { to: '/posts', icon: LayoutList, label: 'Posts' },
    { to: '/calendar', icon: Calendar, label: 'Calendar' },
  ] },
  { label: 'Engage', items: [
    { to: '/inbox', icon: MessageSquare, label: 'Inbox' },
    { to: '/analytics', icon: ChartNoAxesColumn, label: 'Analytics' },
  ] },
  { label: 'Grow', items: [
    { to: '/boost', icon: Zap, label: 'Boost' },
    { to: '/accounts', icon: Link2, label: 'Accounts' },
  ] },
];

export const COMING_SOON: Array<{ icon: ComponentType<{ className?: string }>; label: string }> = [
  { icon: Package, label: 'Inventory' },
  { icon: Video, label: 'AI Video' },
];
