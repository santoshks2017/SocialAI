import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Calendar, Car, Check, MessageSquare, RefreshCw, Send, X } from 'lucide-react';
import api from '../../services/api';
import { postService, type Post } from '../../services/creative';
import type { Festival } from '../../services/dashboard';
import { formatRelativeTime, getInitials } from '../../utils/helpers';
import { cn } from '../ui/Button';
import { LINK_CLASS } from '../ui/linkStyles';
import { useToast } from '../ui/Toast';

const CARD = 'bg-white rounded-2xl border border-zinc-200/80 shadow-sm';
const shortDate = (date: string) => new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

// ── Today's suggested post ──────────────────────────────────────────────────
export function SuggestedPost({ festival }: { festival?: Festival }) {
  const [today] = useState(() => new Date());
  const idea = festival
    ? {
        title: `${festival.name_en} Special Offer`,
        body: `Celebrate ${festival.name_en} with exclusive offers! Visit our showroom for special discounts. Limited period only.`,
        tags: [`#${festival.name_en.replace(/\s+/g, '')}`, '#FestivalOffer', '#CarDeal'],
        category: festival.category ?? 'Weekend Offer',
        date: new Date(festival.date),
        postType: 'festival',
      }
    : {
        title: 'Weekend Test Drive Special',
        body: 'Saturday ho ya Sunday, aapki dream car ka test drive sirf ek call door hai! 🚗✨',
        tags: ['#WeekendOffer', '#TestDrive', '#CarDeal'],
        category: 'Weekend Offer',
        date: today,
        postType: 'promotional',
      };
  const href = `/create?prompt=${encodeURIComponent(`${idea.title}\n\n${idea.body}\n\n${idea.tags.join(' ')}`)}&postType=${encodeURIComponent(idea.postType)}`;

  return (
    <div className={cn(CARD, 'overflow-hidden')}>
      <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 border-b border-zinc-100">
        <span className="text-[11px] font-semibold text-orange-600 tracking-widest uppercase">Today's Suggested Post</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden sm:inline text-xs text-zinc-400">
            {idea.date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
          <NavLink to={href} className={LINK_CLASS}>Create →</NavLink>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 p-4 sm:p-5">
        <div className="w-full sm:w-40 flex-shrink-0 bg-gradient-to-br from-zinc-900 to-zinc-700 rounded-lg flex flex-col items-center justify-center p-4 relative overflow-hidden aspect-[16/9] sm:aspect-[4/3]">
          <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center mb-3">
            <Car className="w-5 h-5 text-orange-400" />
          </div>
          <p className="text-zinc-400 text-[9px] font-bold uppercase tracking-widest mb-1.5">{idea.category.slice(0, 14)}</p>
          <p className="text-white text-xs font-bold text-center leading-snug mb-3 px-1">{idea.title.slice(0, 28)}</p>
          <div className="bg-orange-600 rounded-full px-3 py-1">
            <p className="text-white text-[9px] font-bold">Your Dealership</p>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2.5">
            <span className="bg-teal-50 text-teal-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-teal-100">{idea.category}</span>
            <span className="bg-orange-50 text-orange-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-orange-100">Auto-Suggested</span>
          </div>
          <h3 className="font-semibold text-zinc-900 text-sm leading-tight mb-2">{idea.title}</h3>
          <div className="bg-zinc-50 rounded-lg px-3 py-2.5 mb-3 border border-zinc-100">
            <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">{idea.body}</p>
          </div>
          <div className="flex gap-2 flex-wrap mb-4">
            {idea.tags.map((tag) => <span key={tag} className="text-[11px] text-orange-600 font-medium">{tag}</span>)}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <NavLink to={href} className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-xs">
              <Send className="w-3 h-3" /> Post Everywhere
            </NavLink>
            <NavLink to={href} className="text-xs font-medium text-zinc-700 hover:bg-zinc-50 px-3 py-2 rounded-lg border border-zinc-200 hover:border-zinc-300 bg-white transition-colors">
              Edit First
            </NavLink>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Review & comment inbox ──────────────────────────────────────────────────
interface InboxItem {
  id: string;
  customerName: string;
  platform: string;
  messageType: string;
  messageText: string;
  receivedAt: string;
  isRead: boolean;
  repliedAt?: string;
}

const PLATFORM_NAMES: Record<string, string> = { google: 'Google', gmb: 'Google', instagram: 'Instagram', facebook: 'Facebook' };
const TYPE_NAMES: Record<string, string> = { review: 'Review', dm: 'DM' };

export function InboxPreview({ pending }: { pending: number }) {
  const [items, setItems] = useState<InboxItem[] | null>(null);

  useEffect(() => {
    api.get<{ items: InboxItem[] }>('/inbox', { pageSize: 3 })
      .then((res) => setItems(res.items ?? []))
      .catch(() => setItems([]));
  }, []);

  return (
    <div className={cn(CARD, 'overflow-hidden')}>
      <div className="px-5 py-3.5 flex items-center justify-between border-b border-zinc-100">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-zinc-900 text-sm">Review &amp; Comment Inbox</h3>
          {pending > 0 && (
            <span className="bg-orange-50 text-orange-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-orange-100">{pending} Pending</span>
          )}
        </div>
        <NavLink to="/inbox" className={LINK_CLASS}>View All →</NavLink>
      </div>
      {items === null ? (
        <div className="p-4 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-9 h-9 bg-zinc-100 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-zinc-100 rounded w-1/3" />
                <div className="h-3 bg-zinc-100 rounded w-full" />
                <div className="h-3 bg-zinc-100 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 px-4">
          <MessageSquare className="w-7 h-7 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-zinc-700">Inbox is empty</p>
          <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto leading-relaxed">Reviews and comments from your published posts will appear here.</p>
          <NavLink to="/inbox" className="text-xs text-orange-600 font-medium hover:text-orange-700 mt-2 inline-block">Open inbox</NavLink>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {items.map((m) => {
            const unread = !m.isRead && !m.repliedAt;
            return (
              <li key={m.id} className="p-4 hover:bg-zinc-50/60 transition-colors">
                <NavLink to="/inbox" className="flex gap-3">
                  <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-semibold flex-shrink-0', unread ? 'bg-zinc-900' : 'bg-zinc-400')}>
                    {getInitials(m.customerName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn('text-sm leading-tight', unread ? 'font-bold text-zinc-900' : 'font-medium text-zinc-600')}>{m.customerName}</span>
                      {unread && <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />}
                      <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-medium">
                        {PLATFORM_NAMES[m.platform] ?? m.platform} · {TYPE_NAMES[m.messageType] ?? 'Comment'}
                      </span>
                      <span className="text-[10px] text-zinc-400 ml-auto">{formatRelativeTime(m.receivedAt)}</span>
                    </div>
                    <p className={cn('text-xs leading-relaxed line-clamp-2', unread ? 'text-zinc-700' : 'text-zinc-500')}>“{m.messageText}”</p>
                    {m.repliedAt && (
                      <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1 font-medium"><Check className="w-3 h-3" /> Replied</p>
                    )}
                  </div>
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Coming up ───────────────────────────────────────────────────────────────
interface UpcomingItem { key: string; label: string; date: string; sub: string; kind: 'post' | 'festival' }

function upcomingItems(posts: Post[], festivals: Festival[], now: number): UpcomingItem[] {
  const items: UpcomingItem[] = [
    ...posts
      .filter((p) => p.scheduled_at && new Date(p.scheduled_at).getTime() > now)
      .map((p): UpcomingItem => ({
        key: `post-${p.id}`,
        label: (p.prompt_text?.trim() || 'Scheduled post').slice(0, 42),
        date: p.scheduled_at!,
        sub: `Scheduled${p.platforms?.length ? ` · ${p.platforms.join(', ')}` : ''}`,
        kind: 'post',
      })),
    ...festivals
      .filter((f) => new Date(f.date).getTime() > now)
      .map((f): UpcomingItem => ({ key: `festival-${f.id}`, label: f.name_en, date: f.date, sub: f.category ?? 'Festival', kind: 'festival' })),
  ];
  return items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 3);
}

export function ComingUp({ festivals }: { festivals?: Festival[] }) {
  const navigate = useNavigate();
  const [now] = useState(() => Date.now());
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    postService.list({ status: 'scheduled', pageSize: 20 })
      .then((res) => setPosts(res.data ?? []))
      .catch(() => setPosts([]));
  }, []);

  const items = posts ? upcomingItems(posts, festivals ?? [], now) : null;

  return (
    <div className={cn(CARD, 'p-5')}>
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="font-semibold text-zinc-900 text-sm">Coming Up</h3>
        <button type="button" onClick={() => navigate('/calendar')} className={LINK_CLASS}>Calendar →</button>
      </div>
      {items === null ? (
        <div className="flex items-center justify-center py-4"><RefreshCw className="w-4 h-4 text-zinc-300 animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-5">
          <p className="text-xs text-zinc-400">Nothing scheduled yet</p>
          <button type="button" onClick={() => navigate('/create')} className="text-xs text-orange-600 font-medium mt-1 hover:text-orange-700">+ Schedule a post</button>
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.kind === 'post' ? '/calendar' : '/create')}
              className="w-full flex items-center gap-3 py-2 text-left hover:bg-zinc-50 rounded-lg px-1 -mx-1 transition-colors"
            >
              <div className={cn('w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0', item.kind === 'post' ? 'bg-orange-50 border-orange-100' : 'bg-zinc-50 border-zinc-200')}>
                <Calendar className={cn('w-3.5 h-3.5', item.kind === 'post' ? 'text-orange-500' : 'text-zinc-400')} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{item.label}</p>
                <p className="text-xs text-zinc-400 truncate">{shortDate(item.date)} — {item.sub}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Connected accounts ──────────────────────────────────────────────────────
interface Account { id: string; platform: string; accountName: string; createdAt: string }

const ACCOUNT_STYLE: Record<string, { color: string; label: string }> = {
  facebook: { color: '#1877F2', label: 'Facebook' },
  instagram: { color: '#E1306C', label: 'Instagram' },
  google: { color: '#4285F4', label: 'Google' },
  youtube: { color: '#FF0000', label: 'YouTube' },
};

export function ConnectedAccounts() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<Account[] | null>(null);

  useEffect(() => {
    api.get<{ accounts: Account[] }>('/platform-accounts')
      .then((res) => setAccounts(res.accounts ?? []))
      .catch(() => setAccounts([]));
  }, []);

  const disconnect = async (account: Account) => {
    if (!window.confirm(`Disconnect ${account.accountName}? Posts will stop publishing to it.`)) return;
    try {
      await api.delete(`/platform-accounts/${account.id}`);
      setAccounts((list) => list?.filter((a) => a.id !== account.id) ?? null);
    } catch {
      addToast({ type: 'error', title: 'Could not disconnect', message: 'Try again from Accounts.' });
    }
  };

  return (
    <div className={cn(CARD, 'p-5')}>
      <div className="flex items-center justify-between mb-3.5">
        <h3 className="font-semibold text-zinc-900 text-sm">Connected Accounts</h3>
        <button type="button" onClick={() => navigate('/accounts')} className={LINK_CLASS}>Manage →</button>
      </div>
      {accounts === null ? (
        <div className="flex items-center justify-center py-4"><RefreshCw className="w-4 h-4 text-zinc-300 animate-spin" /></div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-5">
          <p className="text-xs text-zinc-400">No accounts connected</p>
          <button type="button" onClick={() => navigate('/accounts')} className="text-xs text-orange-600 font-medium mt-1 hover:text-orange-700">+ Connect</button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {accounts.slice(0, 5).map((account) => {
            const style = ACCOUNT_STYLE[account.platform] ?? { color: '#888888', label: account.platform };
            return (
              <div key={account.id} className="flex items-center gap-2.5 group">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${style.color}18` }}>
                  <span className="w-3 h-3 rounded-full" style={{ background: style.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-800 truncate">{account.accountName}</p>
                  <p className="text-[10px] text-zinc-400">{style.label} · {formatRelativeTime(account.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => disconnect(account)}
                  title="Disconnect"
                  aria-label={`Disconnect ${account.accountName}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-zinc-400 hover:text-red-500 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
          {accounts.length > 5 && (
            <button type="button" onClick={() => navigate('/accounts')} className="text-[10px] text-zinc-400 font-medium hover:text-orange-600 w-full text-center pt-1">
              +{accounts.length - 5} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
