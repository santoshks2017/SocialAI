import { Menu } from 'lucide-react';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import { useIsDesktop } from './useIsDesktop';

export function MobileTopBar({ onMenuOpen }: { onMenuOpen: () => void }) {
  const isDesktop = useIsDesktop();
  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-sm border-b border-zinc-200 h-14 flex items-center px-4 gap-3 shrink-0">
      <button className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-zinc-100 transition-colors" onClick={onMenuOpen} aria-label="Open menu">
        <Menu className="w-5 h-5 text-zinc-600" />
      </button>
      <div className="flex items-center gap-2.5">
        <Logo />
      </div>
      <div className="flex-1" />
      {!isDesktop && <NotificationBell />}
    </header>
  );
}
