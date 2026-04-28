import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Car, Plus, MessageSquare, Bell,
  Calendar, BarChart2, Package, Zap, Settings, Link2,
  ChevronRight, RefreshCw, Star, Check, Sparkles,
  LayoutDashboard, Video, LogOut, Menu, X, LayoutList,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import api from './services/api';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DealerProfileProvider } from './contexts/DealerProfileContext';

import CreatePost from './pages/CreatePost';
import CalendarPage from './pages/Calendar';
import InboxPage from './pages/InboxPage';
import InventoryPage from './pages/Inventory';
import BoostPage from './pages/Boost';
import AnalyticsPage from './pages/Analytics';
import SettingsPage from './pages/SettingsPage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import ConnectProfilesPage from './pages/ConnectProfilesPage';
import AccountsPage from './pages/AccountsPage';
import ConnectAccountPage from './pages/ConnectAccountPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import PostsPage from './pages/PostsPage';
import type { UserInfo } from './lib/permissions';

// ─── Nav config ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard',  exact: true },
  { to: '/posts',     icon: LayoutList,      label: 'Posts'                  },
  { to: '/calendar',  icon: Calendar,        label: 'Calendar'               },
  { to: '/analytics', icon: BarChart2,       label: 'Analytics'              },
  { to: '/inbox',     icon: MessageSquare,   label: 'Inbox'                  },
  { to: '/inventory', icon: Package,         label: 'Inventory'              },
  { to: '/boost',     icon: Zap,             label: 'Boost'                  },
  { to: '/accounts',  icon: Link2,           label: 'Accounts'               },
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [inboxPending, setInboxPending] = useState<number>(0);
  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U';

  useEffect(() => {
    api.get<{ stats?: { inboxPending?: number } }>('/dealer/dashboard')
      .then((res) => setInboxPending(res.stats?.inboxPending ?? 0))
      .catch(() => {});
  }, []);

  const isVideoMode = location.pathname === '/create' && location.search.includes('mode=video');

  const handleLogout = () => { logout(); navigate('/onboarding'); };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-5 shrink-0">
        <NavLink to="/" className="flex items-center gap-2.5" onClick={onClose}>
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shadow-md">
            <Car className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-[15px] tracking-tight">
            Social<span className="text-orange-400">Genie</span>
          </span>
        </NavLink>
        {/* Mobile close */}
        <button
          className="lg:hidden p-1 text-white/40 hover:text-white transition-colors"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Create Post CTA */}
      <div className="px-3 mb-2">
        <NavLink
          to="/create"
          onClick={onClose}
          className="flex items-center justify-center gap-2 w-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors shadow-lg shadow-orange-500/20"
        >
          <Plus className="w-4 h-4" /> Create Post
        </NavLink>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto py-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            onClick={onClose}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${isActive ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`} />
                {label}
                {label === 'Inbox' && inboxPending > 0 && (
                  <span className="ml-auto bg-orange-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {inboxPending}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* AI Video — coming soon; uses manual active check to avoid false-positive at /create */}
        <NavLink
          to="/create?mode=video"
          onClick={onClose}
          className={() =>
            `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all ${
              isVideoMode
                ? 'bg-white/10 text-white'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`
          }
        >
          <Video className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${isVideoMode ? 'text-white' : 'text-white/40 group-hover:text-white/70'}`} />
          AI Video
          <span className="ml-auto bg-slate-500/20 text-slate-400 text-[10px] font-bold rounded-full px-1.5 py-0.5">
            Soon
          </span>
        </NavLink>
      </nav>

      {/* Divider */}
      <div className="h-px bg-white/5 mx-3" />

      {/* Bottom section */}
      <div className="px-3 py-3 space-y-0.5">
        <NavLink
          to="/settings"
          onClick={onClose}
          className={({ isActive }) =>
            `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all ${
              isActive ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`
          }
        >
          <Settings className="w-[18px] h-[18px] flex-shrink-0 text-white/40 group-hover:text-white/70" />
          Settings
        </NavLink>

        {/* User profile */}
        {user && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mt-1">
            <div className="w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white truncate">{user.name}</p>
              <p className="text-[11px] text-white/30 capitalize">{user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-white/25 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
              title="Sign out"
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
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[220px] bg-[#0f1117] flex-col fixed inset-y-0 left-0 z-40 shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onClose} />
          <aside className="absolute left-0 top-0 bottom-0 w-[220px] bg-[#0f1117] flex flex-col shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

// ─── Top bar (mobile) ─────────────────────────────────────────────────────────
function MobileTopBar({ onMenuOpen }: { onMenuOpen: () => void }) {
  return (
    <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 h-14 flex items-center px-4 gap-3 shrink-0">
      <button
        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors"
        onClick={onMenuOpen}
      >
        <Menu className="w-5 h-5 text-slate-600" />
      </button>
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
          <Car className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-bold text-slate-900 text-sm">Social<span className="text-orange-500">Genie</span></span>
      </div>
      <div className="flex-1" />
      <button className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors">
        <Bell className="w-5 h-5 text-slate-500" />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full" />
      </button>
    </header>
  );
}

// ─── Dashboard data ───────────────────────────────────────────────────────────
interface DashboardData {
  stats: {
    postsThisMonth: number;
    postsChange: number;
    totalReach: number;
    leadsGenerated: number;
    leadsThisWeek: number;
    inboxPending: number;
    negativeReviews: number;
  };
  recentPosts: Array<{
    id: string;
    prompt_text: string;
    platforms: string[];
    status: string;
    scheduled_at: string | null;
    published_at: string | null;
    created_at: string;
  }>;
  upcomingFestivals: Array<{ id: string; name_en: string; date: string; category: string | null }>;
  activeBoosts: Array<{
    id: string;
    daily_budget: number;
    duration_days: number;
    total_spent: number;
    end_date: string | null;
    metrics: unknown;
    post_id: string;
  }>;
}

// ─── Dashboard sub-components ─────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-extrabold ${color} mb-0.5`}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function SuggestedPostCard({ data }: { data: DashboardData | null }) {
  const festival = data?.upcomingFestivals?.[0];
  const title = festival ? `${festival.name_en} Special Offer` : 'Weekend Test Drive Special';
  const caption = festival
    ? `Celebrate ${festival.name_en} with exclusive offers! Visit our showroom for special discounts. Limited period only.`
    : 'Saturday ho ya Sunday, aapki dream car ka test drive sirf ek call door hai! 🚗✨';
  const hashtags = festival
    ? [`#${festival.name_en.replace(/\s+/g, '')}`, '#FestivalOffer', '#CarDeal']
    : ['#WeekendOffer', '#TestDrive', '#CarDeal'];
  const badgeLabel = festival?.category ?? 'Weekend Offer';
  const dateStr = (festival ? new Date(festival.date) : new Date())
    .toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const postType = festival ? 'festival' : 'promotional';
  // Pass the full caption as the prompt so CreatePost pre-fills the description field
  const fullPrompt = `${title}\n\n${caption}\n\n${hashtags.join(' ')}`;
  const createUrl = `/create?prompt=${encodeURIComponent(fullPrompt)}&postType=${encodeURIComponent(postType)}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
      <div className="px-5 py-3 flex items-center justify-between border-b border-slate-50">
        <span className="text-[11px] font-extrabold text-orange-500 tracking-widest uppercase">Today's Suggested Post</span>
        <span className="text-xs text-slate-400">{dateStr}</span>
      </div>
      <div className="flex gap-5 p-5">
        <div className="w-40 flex-shrink-0 bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl flex flex-col items-center justify-center p-4 relative overflow-hidden aspect-[4/3]">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center mb-3">
            <Car className="w-5 h-5 text-orange-400" />
          </div>
          <p className="text-slate-400 text-[9px] font-bold uppercase tracking-widest mb-1.5">
            {badgeLabel.slice(0, 14)}
          </p>
          <p className="text-white text-xs font-bold text-center leading-snug mb-3 px-1">
            {title.slice(0, 28)}
          </p>
          <div className="bg-orange-500 rounded-full px-3 py-1">
            <p className="text-white text-[9px] font-bold">Your Dealership</p>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="bg-teal-50 text-teal-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-teal-100">{badgeLabel}</span>
            <span className="bg-orange-50 text-orange-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-orange-100">Auto-Suggested</span>
          </div>
          <h3 className="font-bold text-slate-900 text-sm leading-tight mb-2">{title}</h3>
          <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-3 border border-slate-100">
            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{caption}</p>
          </div>
          <div className="flex gap-2 flex-wrap mb-4">
            {hashtags.map((h) => (
              <span key={h} className="text-[11px] text-orange-500 font-semibold">{h}</span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <NavLink to={createUrl} className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors">
              <Send className="w-3 h-3" /> Post Everywhere
            </NavLink>
            <NavLink to={createUrl} className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-300 bg-white transition-colors">
              Edit First
            </NavLink>
            <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-2 transition-colors">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InboxPreview({ stats }: { stats?: DashboardData['stats'] }) {
  const pendingCount = stats?.inboxPending ?? 0;
  const [msg, setMsg] = useState<null | { customerName: string; platform: string; messageText: string; aiSuggestedReply?: string; receivedAt: string }>(null);

  useEffect(() => {
    api.get<{ items: Array<{ customerName: string; platform: string; messageText: string; aiSuggestedReply?: string; receivedAt: string }> }>('/inbox', { pageSize: '1', isRead: 'false' })
      .then((r) => setMsg(r.items[0] ?? null))
      .catch(() => {});
  }, []);

  const platformLabel = (p: string) => p === 'google' ? 'Google Review' : p === 'instagram' ? 'Instagram' : 'Facebook';
  const timeAgo = (iso: string) => {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
    return h < 1 ? 'Just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
  };
  const initials = (name: string) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-slate-50">
        <div className="flex items-center gap-2.5">
          <h3 className="font-semibold text-slate-900 text-sm">Review & Comment Inbox</h3>
          {pendingCount > 0 && (
            <span className="bg-orange-50 text-orange-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-orange-100">
              {pendingCount} Pending
            </span>
          )}
        </div>
        <NavLink to="/inbox" className="text-xs text-orange-500 font-semibold hover:text-orange-600 flex items-center gap-0.5">
          View All <ChevronRight className="w-3.5 h-3.5" />
        </NavLink>
      </div>
      <div className="p-4">
        {msg ? (
          <div className="flex gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
              {initials(msg.customerName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-semibold text-sm text-slate-900">{msg.customerName}</span>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">{platformLabel(msg.platform)}</span>
                <span className="text-[10px] text-slate-400 ml-auto">{timeAgo(msg.receivedAt)}</span>
              </div>
              <p className="text-xs text-slate-500 mb-2.5 leading-relaxed line-clamp-2">"{msg.messageText}"</p>
              {msg.aiSuggestedReply && (
                <div className="bg-teal-50 border border-teal-100 rounded-xl p-2.5 mb-2.5">
                  <p className="text-[10px] font-bold text-teal-600 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> AI Suggested Reply
                  </p>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{msg.aiSuggestedReply}</p>
                </div>
              )}
              <div className="flex gap-2">
                <NavLink to="/inbox" className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
                  <Check className="w-3 h-3" /> {msg.aiSuggestedReply ? 'Approve & Send' : 'Open Inbox'}
                </NavLink>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <MessageSquare className="w-7 h-7 text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-medium">No pending reviews</p>
            <NavLink to="/inbox" className="text-xs text-orange-500 font-semibold hover:text-orange-600 mt-1 inline-block">View Inbox</NavLink>
          </div>
        )}
      </div>
    </div>
  );
}

function getUpcomingDefaults() {
  const today = new Date();
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  const nextSat = new Date(today);
  const daysToSat = (6 - today.getDay() + 7) % 7 || 7;
  nextSat.setDate(today.getDate() + daysToSat);

  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const nextMonthMid = new Date(today.getFullYear(), today.getMonth() + 1, 15);

  return [
    { label: 'Weekend Test Drive Special', dateStr: fmt(nextSat), sub: 'Schedule a post' },
    { label: 'Month-End Closing Offer', dateStr: fmt(endOfMonth), sub: 'Suggest closing deals' },
    { label: 'New Arrival Announcement', dateStr: fmt(nextMonthMid), sub: 'Plan ahead' },
  ];
}

function ComingUpPanel({ festivals }: { festivals?: DashboardData['upcomingFestivals'] }) {
  const items = festivals?.length
    ? festivals.slice(0, 3).map((f) => ({
        label: f.name_en,
        dateStr: new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        sub: f.category ?? 'Festival',
      }))
    : getUpcomingDefaults();

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900 text-sm mb-3.5">Coming Up</h3>
      <div className="space-y-2">
        {items.map(({ label, dateStr, sub }) => (
          <div key={label} className="flex items-center gap-3 py-2">
            <div className="w-8 h-8 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">{label}</p>
              <p className="text-xs text-slate-400">{dateStr} — {sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectedPanel() {
  const [accounts, setAccounts] = useState<{id:string;platform:string;accountName:string;createdAt:string}[]>([]);
  const [loading, setLoading] = useState(true);

  const PLATFORM_META: Record<string, { label: string; color: string }> = {
    facebook:  { label: 'Facebook',  color: '#1877F2' },
    instagram: { label: 'Instagram', color: '#E1306C' },
    google:    { label: 'Google',    color: '#4285F4' },
  };

  useEffect(() => {
    api.get<{ success: boolean; accounts: typeof accounts }>('/platform-accounts')
      .then((res) => setAccounts(res.accounts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/platform-accounts/${id}`);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch { /* ignore */ }
  };

  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="font-semibold text-slate-900 text-sm">Connected Accounts</h3>
        <button onClick={() => navigate('/accounts')} className="text-[10px] text-orange-500 font-bold hover:text-orange-600">
          Manage →
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <RefreshCw className="w-4 h-4 text-slate-300 animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-xs text-slate-400">No accounts connected</p>
          <button onClick={() => navigate('/accounts')} className="text-xs text-orange-500 font-semibold mt-1 hover:text-orange-600">
            + Connect
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {accounts.slice(0, 5).map((acc) => {
            const meta = PLATFORM_META[acc.platform] ?? { label: acc.platform, color: '#888' };
            const timeAgo = (() => {
              const diff = Date.now() - new Date(acc.createdAt).getTime();
              const days = Math.floor(diff / 86400000);
              if (days > 0) return `${days}d ago`;
              const hrs = Math.floor(diff / 3600000);
              return hrs > 0 ? `${hrs}h ago` : 'Just now';
            })();
            return (
              <div key={acc.id} className="flex items-center gap-2.5 group">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${meta.color}18` }}>
                  <div className="w-3 h-3 rounded-full" style={{ background: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{acc.accountName}</p>
                  <p className="text-[10px] text-slate-400">{meta.label} · {timeAgo}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1 text-slate-300 hover:text-slate-500 transition-colors" title="Refresh token">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDelete(acc.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="Disconnect">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
          {accounts.length > 5 && (
            <button onClick={() => navigate('/accounts')} className="text-[10px] text-slate-400 font-semibold hover:text-orange-500 w-full text-center pt-1">
              +{accounts.length - 5} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  useEffect(() => {
    api.get<{ success: boolean } & DashboardData>('/dealer/dashboard')
      .then((res) => setData(res))
      .catch(console.error);
  }, []);

  return (
    <div className="max-w-[1180px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">{greeting}{firstName ? `, ${firstName}` : ''} 👋</h1>
        <p className="text-sm text-slate-400 mt-0.5">Your dealership social presence at a glance</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Posts this month"  value={data?.stats.postsThisMonth ?? 0} sub="vs last month"  color="text-slate-900" />
        <StatCard label="Total reach"        value={data?.stats.totalReach ? `${(data.stats.totalReach / 1000).toFixed(1)}k` : '—'} sub="across platforms" color="text-slate-900" />
        <StatCard label="Leads generated"    value={data?.stats.leadsGenerated ?? 0} sub="this month" color="text-teal-600" />
        <StatCard label="Inbox pending"      value={data?.stats.inboxPending ?? 0} sub="need reply" color="text-orange-500" />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        <div className="space-y-5">
          <SuggestedPostCard data={data} />
          <InboxPreview stats={data?.stats} />
        </div>
        <div className="space-y-4">
          <ComingUpPanel festivals={data?.upcomingFestivals} />
          <ConnectedPanel />
        </div>
      </div>
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────
function AppLayout({ children, fullBleed }: { children: React.ReactNode; fullBleed?: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden bg-[#f1f5f9]">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col lg:pl-[220px] min-w-0">
        <MobileTopBar onMenuOpen={() => setMobileOpen(true)} />
        <main className={`flex-1 min-h-0 ${fullBleed ? 'overflow-hidden flex flex-col' : 'overflow-y-auto p-5 md:p-7'}`}>
          {children}
        </main>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, token, isInitializing } = useAuth();
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  // No login page — demo session is always auto-issued; render children regardless
  if (!user && !token) return <>{children}</>;
  return <>{children}</>;
}

// Inner component that has access to AuthContext
function AppRoutes() {
  const { loginWithToken } = useAuth();

  const handleLogin = (token: string, refresh: string, user: UserInfo) => {
    loginWithToken(token, refresh, user);
  };

  return (
    <DealerProfileProvider>
    <Routes>
      {/* Public routes — /login always redirects to dashboard */}
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/auth/callback" element={<AuthCallbackPage onLogin={handleLogin} />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

      {/* Protected routes */}
      <Route path="/onboarding" element={<RequireAuth><ConnectProfilesPage /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><AppLayout><Dashboard /></AppLayout></RequireAuth>} />
      <Route path="/create" element={<RequireAuth><AppLayout fullBleed><CreatePost /></AppLayout></RequireAuth>} />
      <Route path="/posts"    element={<RequireAuth><AppLayout><PostsPage /></AppLayout></RequireAuth>} />
      <Route path="/calendar" element={<RequireAuth><AppLayout><CalendarPage /></AppLayout></RequireAuth>} />
      <Route path="/inbox" element={<RequireAuth><AppLayout><InboxPage /></AppLayout></RequireAuth>} />
      <Route path="/inventory" element={<RequireAuth><AppLayout><InventoryPage /></AppLayout></RequireAuth>} />
      <Route path="/analytics" element={<RequireAuth><AppLayout><AnalyticsPage /></AppLayout></RequireAuth>} />
      <Route path="/boost" element={<RequireAuth><AppLayout><BoostPage /></AppLayout></RequireAuth>} />
      <Route path="/accounts" element={<RequireAuth><AppLayout><AccountsPage /></AppLayout></RequireAuth>} />
      <Route path="/accounts/create" element={<RequireAuth><AppLayout><ConnectAccountPage /></AppLayout></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><AppLayout><SettingsPage /></AppLayout></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </DealerProfileProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ToastProvider>
  );
}
