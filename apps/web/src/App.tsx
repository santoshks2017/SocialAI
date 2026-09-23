import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Car, MessageSquare,
  Calendar,
  ChevronRight, Send, RefreshCw, Check, Sparkles,
  X,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import api from './services/api';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DealerProfileProvider } from './contexts/DealerProfileContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AppLayout } from './components/shell/AppLayout';

import CreatePost from './pages/CreatePost';
import CalendarPage from './pages/Calendar';
import InboxPage from './pages/InboxPage';
import InventoryPage from './pages/Inventory';
import BoostPage from './pages/Boost';
import AnalyticsPage from './pages/Analytics';
import AuthCallbackPage from './pages/AuthCallbackPage';
import SettingsPage from './pages/SettingsPage';
import AccountsPage from './pages/AccountsPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import PostsPage from './pages/PostsPage';
import Onboarding from './pages/Onboarding';
import BillingPage from './pages/BillingPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import ApiConnectionsPage from './pages/admin/ApiConnectionsPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ConnectProfilesPage from './pages/ConnectProfilesPage';
import type { UserInfo } from './lib/permissions';
import { isGlobalOwner } from './lib/permissions';

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
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-extrabold ${color} mb-0.5`}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function SuggestedPostCard({ data }: { data: DashboardData | null }) {
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const festivals = data?.upcomingFestivals ?? [];
  const festival = festivals.length ? festivals[suggestionIdx % festivals.length] : undefined;
  const festivalName = festival ? (festival.name_en || (festival as any).name || '') : '';
  const title = festival && festivalName ? `${festivalName} Special Offer` : 'Weekend Test Drive Special';
  const caption = festival && festivalName
    ? `Celebrate ${festivalName} with exclusive offers! Visit our showroom for special discounts. Limited period only.`
    : 'Saturday ho ya Sunday, aapki dream car ka test drive sirf ek call door hai! 🚗✨';
  const hashtags = festival && festivalName
    ? [`#${festivalName.replace(/\s+/g, '')}`, '#FestivalOffer', '#CarDeal']
    : ['#WeekendOffer', '#TestDrive', '#CarDeal'];
  const badgeLabel = festival?.category ?? 'Weekend Offer';
  const dateStr = (festival ? new Date(festival.date) : new Date())
    .toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const postType = festival ? 'festival' : 'promotional';
  // Pass the full caption as the prompt so CreatePost pre-fills the description field
  const fullPrompt = `${title}\n\n${caption}\n\n${hashtags.join(' ')}`;
  const createUrl = `/create?prompt=${encodeURIComponent(fullPrompt)}&postType=${encodeURIComponent(postType)}`;

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 flex items-center justify-between border-b border-slate-200 bg-slate-50/50">
        <span className="text-[11px] font-extrabold text-orange-500 tracking-widest uppercase">Today's Suggested Post</span>
        <span className="text-xs text-slate-500">{dateStr}</span>
      </div>
      <div className="flex gap-5 p-5">
        <div className="w-40 flex-shrink-0 bg-gradient-to-br from-slate-100 to-slate-50 rounded-xl flex flex-col items-center justify-center p-4 relative overflow-hidden aspect-[4/3] border border-slate-250">
          <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center mb-3">
            <Car className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest mb-1.5">
            {badgeLabel.slice(0, 14)}
          </p>
          <p className="text-slate-800 text-xs font-bold text-center leading-snug mb-3 px-1">
            {title.slice(0, 28)}
          </p>
          <div className="bg-orange-500 rounded-full px-3 py-1">
            <p className="text-white text-[9px] font-bold">Your Dealership</p>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="bg-teal-50 text-teal-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-teal-200">{badgeLabel}</span>
            <span className="bg-orange-50 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-orange-200">Auto-Suggested</span>
          </div>
          <h3 className="font-bold text-slate-900 text-sm leading-tight mb-2">{title}</h3>
          <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-3 border border-slate-100">
            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{caption}</p>
          </div>
          <div className="flex gap-2 flex-wrap mb-4">
            {hashtags.map((h) => (
              <span key={h} className="text-[11px] text-orange-600 font-semibold">{h}</span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <NavLink to={createUrl} className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-orange-500/20">
              <Send className="w-3 h-3" /> Post Everywhere
            </NavLink>
            <NavLink to={createUrl} className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-3 py-2 rounded-lg border border-slate-200 hover:border-slate-350 bg-white hover:bg-slate-50 transition-colors">
              Edit First
            </NavLink>
            {festivals.length > 1 && (
              <button
                onClick={() => setSuggestionIdx((i) => i + 1)}
                title="Show another suggestion"
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-750 px-2 py-2 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
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
    <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-slate-200 bg-slate-50/50">
        <div className="flex items-center gap-2.5">
          <h3 className="font-semibold text-slate-900 text-sm">Review & Comment Inbox</h3>
          {pendingCount > 0 && (
            <span className="bg-orange-50 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-orange-200">
              {pendingCount} Pending
            </span>
          )}
        </div>
        <NavLink to="/inbox" className="text-xs text-orange-600 font-semibold hover:text-orange-750 flex items-center gap-0.5">
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
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">{platformLabel(msg.platform)}</span>
                <span className="text-[10px] text-slate-500 ml-auto">{timeAgo(msg.receivedAt)}</span>
              </div>
              <p className="text-xs text-slate-600 mb-2.5 leading-relaxed line-clamp-2">"{msg.messageText}"</p>
              {msg.aiSuggestedReply && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-2.5 mb-2.5">
                  <p className="text-[10px] font-bold text-teal-750 mb-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-teal-600" /> AI Suggested Reply
                  </p>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{msg.aiSuggestedReply}</p>
                </div>
              )}
              <div className="flex gap-2">
                <NavLink to="/inbox" className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-lg shadow-teal-600/10">
                  <Check className="w-3 h-3" /> {msg.aiSuggestedReply ? 'Approve & Send' : 'Open Inbox'}
                </NavLink>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <MessageSquare className="w-7 h-7 text-slate-400 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">No pending reviews</p>
            <NavLink to="/inbox" className="text-xs text-orange-600 font-semibold hover:text-orange-750 mt-1 inline-block">View Inbox</NavLink>
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
        label: f.name_en || (f as any).name || 'Festival',
        dateStr: new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        sub: f.category ?? 'Festival',
      }))
    : getUpcomingDefaults();

  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900 text-sm mb-3.5">Coming Up</h3>
      <div className="space-y-2">
        {items.map(({ label, dateStr, sub }) => (
          <div key={label} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
            <div className="w-8 h-8 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">{label}</p>
              <p className="text-xs text-slate-500">{dateStr} — {sub}</p>
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
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="font-semibold text-slate-900 text-sm">Connected Accounts</h3>
        <button onClick={() => navigate('/accounts')} className="text-[10px] text-orange-600 font-bold hover:text-orange-750">
          Manage →
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <RefreshCw className="w-4 h-4 text-orange-500 animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-xs text-slate-500">No accounts connected</p>
          <button onClick={() => navigate('/accounts')} className="text-xs text-orange-600 font-semibold mt-1 hover:text-orange-750">
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
                  <p className="text-[10px] text-slate-500">{meta.label} · {timeAgo}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleDelete(acc.id)} className="p-1 text-slate-400 hover:text-red-650 transition-colors" title="Disconnect">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
          {accounts.length > 5 && (
            <button onClick={() => navigate('/accounts')} className="text-[10px] text-slate-500 font-semibold hover:text-orange-600 w-full text-center pt-1">
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
        <p className="text-sm text-slate-500 mt-0.5">Your dealership social presence at a glance</p>
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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, token, isInitializing } = useAuth();
  const location = useLocation();

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

// Client-side guard only; the API enforces owner access on /v1/admin too.
function RequireGlobalOwner({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!isGlobalOwner(user)) return <Navigate to="/" replace />;
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
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage onLogin={handleLogin} />} />
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

      {/* Protected routes */}
      <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><AppLayout><Dashboard /></AppLayout></RequireAuth>} />
      <Route path="/create" element={<RequireAuth><AppLayout fullBleed><CreatePost /></AppLayout></RequireAuth>} />
      <Route path="/posts"    element={<RequireAuth><AppLayout><PostsPage /></AppLayout></RequireAuth>} />
      <Route path="/calendar" element={<RequireAuth><AppLayout><CalendarPage /></AppLayout></RequireAuth>} />
      <Route path="/inbox" element={<RequireAuth><AppLayout><InboxPage /></AppLayout></RequireAuth>} />
      <Route path="/inventory" element={<RequireAuth><AppLayout><InventoryPage /></AppLayout></RequireAuth>} />
      <Route path="/analytics" element={<RequireAuth><AppLayout><AnalyticsPage /></AppLayout></RequireAuth>} />
      <Route path="/boost" element={<RequireAuth><AppLayout><BoostPage /></AppLayout></RequireAuth>} />
      <Route path="/accounts" element={<RequireAuth><AppLayout><AccountsPage /></AppLayout></RequireAuth>} />
      <Route path="/accounts/create" element={<RequireAuth><AppLayout><ConnectProfilesPage /></AppLayout></RequireAuth>} />
      <Route path="/billing" element={<RequireAuth><AppLayout><BillingPage /></AppLayout></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><RequireGlobalOwner><AppLayout><AdminDashboard /></AppLayout></RequireGlobalOwner></RequireAuth>} />
      <Route path="/admin/apis" element={<RequireAuth><RequireGlobalOwner><AppLayout><ApiConnectionsPage /></AppLayout></RequireGlobalOwner></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><AppLayout><SettingsPage /></AppLayout></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </DealerProfileProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Router>
            <AppRoutes />
          </Router>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
