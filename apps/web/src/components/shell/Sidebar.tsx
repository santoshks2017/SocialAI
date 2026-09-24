import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, Plus, Settings, ShieldCheck, X } from 'lucide-react';
import { inboxService } from '../../services/inbox';
import { useAuth } from '../../contexts/AuthContext';
import { isGlobalOwner } from '../../lib/permissions';
import { roleLabel } from '../../utils/roleLabel';
import { COMING_SOON, NAV_SECTIONS } from './navConfig';
import { Logo } from './Logo';
import { NotificationBell } from './NotificationBell';
import { useIsDesktop } from './useIsDesktop';

const ITEM_BASE = 'group relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors';
const ITEM_INACTIVE = 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900';
const ITEM_ACTIVE = 'bg-orange-50 text-zinc-900 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:bg-orange-500 before:rounded-full';
const SECTION_LABEL = 'px-4 pt-1 pb-1 text-[10px] font-semibold text-zinc-400 tracking-[0.12em] uppercase';
const MIN_GAP_MS = 55_000;

const itemClass = ({ isActive }: { isActive: boolean }) => `${ITEM_BASE} ${isActive ? ITEM_ACTIVE : ITEM_INACTIVE}`;
const iconClass = (isActive: boolean) =>
  `w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-orange-600' : 'text-zinc-400 group-hover:text-zinc-600'}`;

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const owner = isGlobalOwner(user);
  const isDesktop = useIsDesktop();
  const [inboxPending, setInboxPending] = useState(0);
  const initials = user?.name ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() : 'U';

  // Inbox badge (unread count from GET /inbox/pending-count): refreshed on mount, every minute, on window
  // focus, and when the Inbox changes. The focus and interval refreshes skip while the tab is hidden and
  // while the last load was recent. A plan without the inbox answers 403, which leaves the badge at 0.
  useEffect(() => {
    if (owner) return;
    let lastLoadAt = 0;
    const load = () => {
      lastLoadAt = Date.now();
      inboxService.pendingCount()
        .then((res) => setInboxPending(res.pending))
        .catch(() => {});
    };
    const refreshIfDue = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadAt < MIN_GAP_MS) return;
      load();
    };
    load();
    window.addEventListener('inbox:changed', load);
    window.addEventListener('focus', refreshIfDue);
    const id = setInterval(refreshIfDue, 60_000);
    return () => {
      window.removeEventListener('inbox:changed', load);
      window.removeEventListener('focus', refreshIfDue);
      clearInterval(id);
    };
  }, [owner]);

  const handleLogout = () => { logout(); navigate('/onboarding'); };

  const content = (
    <div className="flex flex-col h-full">
      <div className="h-16 flex items-center justify-between px-5 shrink-0 border-b border-zinc-100">
        <NavLink to="/" className="flex items-center gap-2.5" onClick={onClose}>
          <Logo />
        </NavLink>
        <div className="hidden lg:block">
          {isDesktop && <NotificationBell align="left" />}
        </div>
        <button className="lg:hidden p-1 text-zinc-400 hover:text-zinc-700 transition-colors" onClick={onClose}>
          <X className="w-5 h-5" />
        </button>
      </div>

      {!owner && (
        <div className="px-3 pt-4 pb-1">
          <NavLink
            to="/create"
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-orange-600 to-amber-500 hover:from-orange-700 hover:to-amber-600 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors shadow-sm shadow-orange-500/20"
          >
            <Plus className="w-4 h-4" /> Create Post
          </NavLink>
        </div>
      )}

      <nav className="flex-1 px-3 overflow-y-auto py-2 space-y-3">
        {!owner && NAV_SECTIONS.map((section) => (
          <div key={section.label} className="space-y-0.5">
            <p className={SECTION_LABEL}>{section.label}</p>
            {section.items.map(({ to, icon: Icon, label, exact }) => (
              <NavLink key={to} to={to} end={exact} onClick={onClose} className={itemClass}>
                {({ isActive }) => (
                  <>
                    <Icon className={iconClass(isActive)} />
                    {label}
                    {label === 'Inbox' && inboxPending > 0 && (
                      <span className={`ml-auto text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ${isActive ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700'}`}>
                        {inboxPending}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        ))}

        {owner && (
          <div className="space-y-0.5">
            <p className={SECTION_LABEL}>Admin</p>
            <NavLink to="/admin" end onClick={onClose} className={itemClass}>
              {({ isActive }) => (<><ShieldCheck className={iconClass(isActive)} />Console</>)}
            </NavLink>
            <NavLink to="/admin/apis" onClick={onClose} className={itemClass}>
              {({ isActive }) => (<><KeyRound className={iconClass(isActive)} />APIs &amp; models</>)}
            </NavLink>
          </div>
        )}

        {!owner && (
          <div className="space-y-0.5">
            <p className={SECTION_LABEL}>Coming soon</p>
            <div className="px-4 flex flex-wrap gap-1.5">
              {COMING_SOON.map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-50 text-zinc-400 text-[11px] font-medium cursor-default select-none">
                  <Icon className="w-3 h-3" />{label}
                </span>
              ))}
            </div>
          </div>
        )}
      </nav>

      <div className="h-px bg-zinc-100 mx-3" />

      <div className="px-3 py-3 space-y-0.5">
        {!owner && (
          <NavLink to="/settings" onClick={onClose} className={itemClass}>
            {({ isActive }) => (<><Settings className={iconClass(isActive)} />Settings</>)}
          </NavLink>
        )}
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg mt-1 hover:bg-zinc-50 transition-colors group">
            <div className="w-8 h-8 bg-gradient-to-br from-[#3f3f46] to-[#18181b] rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 ring-2 ring-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-zinc-900 truncate leading-tight">{user.name}</p>
              <span className="inline-block mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">
                {roleLabel(user.role)}
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
              className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex w-[220px] bg-white border-r border-zinc-200 flex-col fixed inset-y-0 left-0 z-40 shrink-0">
        {content}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" onClick={onClose} />
          <aside className="absolute left-0 top-0 bottom-0 w-[220px] bg-white border-r border-zinc-200 flex flex-col shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
