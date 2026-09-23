import { useState, type ReactNode } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { MobileTopBar } from './MobileTopBar';
import { DisconnectedBanner } from './DisconnectedBanner';

export function AppLayout({ children, fullBleed }: { children: ReactNode; fullBleed?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loginWithToken } = useAuth();
  const isImpersonating = !!localStorage.getItem('admin_access_token');

  const handleStopImpersonation = () => {
    const token = localStorage.getItem('admin_access_token');
    const refresh = localStorage.getItem('admin_refresh_token');
    const userStr = localStorage.getItem('admin_user_info');
    if (token && userStr) {
      localStorage.removeItem('admin_access_token');
      localStorage.removeItem('admin_refresh_token');
      localStorage.removeItem('admin_user_info');
      loginWithToken(token, refresh || '', JSON.parse(userStr));
      window.location.href = '/admin';
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-50">
      {isImpersonating && (
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shrink-0 shadow-md relative z-50">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-3.5 h-3.5 animate-pulse" />
            <span>Impersonation Active: You are acting as admin for <span className="underline">{user?.name}</span></span>
          </div>
          <button
            onClick={handleStopImpersonation}
            className="bg-white text-orange-700 hover:bg-orange-50 font-black px-3 py-1 rounded-md transition-colors shadow-sm text-[10px] uppercase tracking-wider"
          >
            Stop Impersonating
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        <div className="flex-1 flex flex-col lg:pl-[220px] min-w-0">
          <MobileTopBar onMenuOpen={() => setMobileOpen(true)} />
          <DisconnectedBanner />
          <main className={`flex-1 min-h-0 ${fullBleed ? 'overflow-hidden flex flex-col' : 'overflow-y-auto p-5 md:p-7'}`}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
