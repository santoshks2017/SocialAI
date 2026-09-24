import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, CheckCheck, RefreshCw, Search } from 'lucide-react';
import { AutoReplyModal } from '../components/inbox/AutoReplySettings';
import { StatPill } from '../components/inbox/Badges';
import { FilterBar } from '../components/inbox/FilterBar';
import { PlatformBreakdownCard, QuickActionsCard, ResponseStatsCard } from '../components/inbox/InboxSidebar';
import { MarkAllReadModal } from '../components/inbox/MarkAllReadModal';
import { MessageCard } from '../components/inbox/MessageCard';
import { MessageSkeleton, NoMessages, NoResults } from '../components/inbox/MessageList';
import { Button, cn } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { PlanGatedNotice } from '../components/ui/PlanGatedNotice';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { can, PERMISSIONS } from '../lib/permissions';
import { ApiError, isPlanGated } from '../services/api';
import { inboxService, leadService } from '../services/inbox';
import {
  apiPlatform, DEFAULT_FILTERS, draftFromSuggestions, filterMessages, inboxStats, quickActionFilters, REVIEW_REQUEST_PROMPT,
  toInboxItem, type DraftState, type InboxFilters, type InboxItem,
} from '../utils/inbox';

const POLL_MS = 60_000;
const SEARCH = 'pl-9 pr-4 h-9 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-zinc-400 bg-white transition-colors';

const withId = (set: Set<string>, id: string) => new Set(set).add(id);
const withoutId = (set: Set<string>, id: string) => {
  const next = new Set(set);
  next.delete(id);
  return next;
};
// The sidebar's Inbox badge listens for this.
const inboxChanged = () => window.dispatchEvent(new Event('inbox:changed'));

export default function InboxPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const canReply = can(user, PERMISSIONS.REPLY_INBOX);

  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [planGated, setPlanGated] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_FILTERS);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [generating, setGenerating] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState<Set<string>>(() => new Set());
  const [sent, setSent] = useState<Set<string>>(() => new Set());
  const [leadBusy, setLeadBusy] = useState<Set<string>>(() => new Set());
  const [leadCreated, setLeadCreated] = useState<Set<string>>(() => new Set());
  const [converting, setConverting] = useState<string | null>(null);
  const [markAllOpen, setMarkAllOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [autoReplyOpen, setAutoReplyOpen] = useState(false);

  // List failures stay silent, as in the reference; a plan without the inbox gets the upgrade notice.
  const load = useCallback(() =>
    inboxService.list({ pageSize: 50 })
      .then((res) => {
        setItems(res.items.map(toInboxItem));
        setNow(Date.now());
        setPlanGated(null);
      })
      .catch((err: unknown) => {
        if (isPlanGated(err)) setPlanGated(err.message);
      })
      .finally(() => setLoading(false)), []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  };

  const planToast = (err: unknown, forReply: boolean): boolean => {
    if (!isPlanGated(err)) return false;
    addToast({
      type: 'error',
      title: 'Upgrade required',
      message: forReply
        ? 'Replying to reviews is a Growth/Pro feature. Upgrade in Settings → Billing.'
        : 'AI reply suggestions are a Growth/Pro feature. Upgrade in Settings → Billing.',
    });
    return true;
  };

  const toggle = (item: InboxItem) => {
    const opening = !expanded.has(item.id);
    setExpanded((prev) => (prev.has(item.id) ? withoutId(prev, item.id) : withId(prev, item.id)));
    // A suggestion saved earlier (an auto-reply rule awaiting approval) opens in the AI panel.
    if (opening && item.aiSuggestedReply && !drafts[item.id]) {
      setDrafts((prev) => ({ ...prev, [item.id]: draftFromSuggestions([item.aiSuggestedReply ?? '']) }));
    }
    if (opening && !item.isRead) {
      setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, isRead: true } : m)));
      inboxService.markRead(item.id).then(inboxChanged).catch(() => {});
    }
  };

  const setDraft = (id: string, draft: DraftState) => setDrafts((prev) => ({ ...prev, [id]: draft }));

  const generate = async (item: InboxItem) => {
    setGenerating((s) => withId(s, item.id));
    try {
      const res = await inboxService.generateReply(item.id);
      setDraft(item.id, draftFromSuggestions(res.suggestions?.length ? res.suggestions : [res.suggestedReply]));
    } catch (err) {
      if (planToast(err, false)) return;
      if (err instanceof ApiError && err.code === 'AI_NOT_CONFIGURED') {
        addToast({ type: 'error', title: 'AI replies aren’t set up yet', message: 'Write your reply manually for now.' });
      } else {
        addToast({ type: 'error', title: 'Failed to generate reply', message: 'Please try again.' });
      }
    } finally {
      setGenerating((s) => withoutId(s, item.id));
    }
  };

  const send = async (item: InboxItem, text: string) => {
    setSending((s) => withId(s, item.id));
    try {
      const res = await inboxService.sendReply(item.id, text.trim());
      setItems((prev) => prev.map((m) => (m.id === item.id ? toInboxItem(res.item) : m)));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      if (res.delivered === false) {
        addToast({ type: 'warning', title: 'Reply saved, not delivered', message: 'Check that this platform is connected in Accounts, then try again.' });
      } else {
        setSent((s) => withId(s, item.id));
        addToast({ type: 'success', title: 'Reply sent' });
      }
    } catch (err) {
      if (planToast(err, true)) return;
      addToast({ type: 'error', title: 'Reply failed', message: 'Could not post your reply. Please try again.' });
    } finally {
      setSending((s) => withoutId(s, item.id));
    }
  };

  const createLead = async (item: InboxItem) => {
    setLeadBusy((s) => withId(s, item.id));
    try {
      await leadService.create({ customerName: item.customerName, sourcePlatform: apiPlatform(item.platform), sourceMessageId: item.id });
      setLeadCreated((s) => withId(s, item.id));
      setItems((prev) => prev.map((m) => (m.id === item.id && m.tag === 'general' ? { ...m, tag: 'lead' } : m)));
      addToast({ type: 'success', title: 'Lead created', message: `${item.customerName} added to your leads.` });
    } catch {
      addToast({ type: 'error', title: 'Failed to create lead', message: 'Please try again.' });
    } finally {
      setLeadBusy((s) => withoutId(s, item.id));
    }
  };

  const markNotSpam = async (item: InboxItem) => {
    try {
      await inboxService.updateTag(item.id, 'general');
      setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, tag: 'general' } : m)));
    } catch {
      addToast({ type: 'error', title: 'Could not update message', message: 'Please try again.' });
    }
  };

  const turnIntoPost = async (item: InboxItem) => {
    setConverting(item.id);
    try {
      const { post } = await inboxService.generatePostDraft(item.id);
      navigate(`/create?edit=${encodeURIComponent(post.id)}`);
    } catch (err) {
      const notSetUp = err instanceof ApiError && err.code === 'AI_NOT_CONFIGURED';
      addToast({
        type: 'error',
        title: notSetUp ? 'AI isn’t set up yet' : 'Could not create the post',
        message: notSetUp ? 'Create the post yourself in Create.' : 'Please try again.',
      });
      setConverting(null);
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await inboxService.markAllRead();
      setItems((prev) => prev.map((m) => ({ ...m, isRead: true })));
      setMarkAllOpen(false);
      inboxChanged();
      addToast({ type: 'success', title: 'Marked all read' });
    } catch {
      addToast({ type: 'error', title: 'Failed', message: 'Please try again.' });
    } finally {
      setMarkingAll(false);
    }
  };

  if (planGated) return <PlanGatedNotice feature="Inbox" message={planGated} />;

  const stats = inboxStats(items);
  const visible = filterMessages(items, filters);
  const setSearch = (search: string) => setFilters((f) => ({ ...f, search }));

  return (
    <PageCard>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Inbox</h1>
          {items.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <StatPill value={stats.unread} label="unread" dot="bg-orange-500" strong={stats.unread > 0} />
              <StatPill value={stats.replied} label="replied" dot="bg-teal-500" />
              <StatPill value={stats.avgRating.toFixed(1)} label="★ avg" dot="bg-yellow-400" />
              <StatPill value={`${stats.responseRate}%`} label="response rate" dot="bg-emerald-500" />
            </div>
          ) : (
            <p className="text-sm text-zinc-500 mt-0.5">All customer feedback across platforms — respond with AI assistance</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input value={filters.search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" aria-label="Search messages" className={cn(SEARCH, 'w-44')} />
          </div>
          {canReply && (
            <Button variant="secondary" onClick={() => setAutoReplyOpen(true)} title="Auto-reply rules and templates">
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">Auto-reply</span>
            </Button>
          )}
          {stats.unread > 0 && (
            <Button variant="secondary" onClick={() => setMarkAllOpen(true)}>
              <CheckCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Mark All Read</span>
            </Button>
          )}
          <Button variant="ghost" className="w-9 px-0" onClick={refresh} title="Refresh" aria-label="Refresh">
            <RefreshCw className={cn('w-4 h-4', (refreshing || loading) && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="relative sm:hidden mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input value={filters.search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reviews…" aria-label="Search messages" className={cn(SEARCH, 'w-full')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_272px] gap-6">
        <div className="space-y-4 min-w-0">
          <FilterBar items={items} filters={filters} onChange={setFilters} />
          {loading ? (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <MessageSkeleton key={i} />)}</div>
          ) : items.length === 0 ? (
            <NoMessages />
          ) : visible.length === 0 ? (
            <NoResults />
          ) : (
            <div className="space-y-3">
              {visible.map((item) => (
                <MessageCard
                  key={item.id}
                  item={item}
                  expanded={expanded.has(item.id)}
                  canReply={canReply}
                  draft={drafts[item.id]}
                  generating={generating.has(item.id)}
                  sending={sending.has(item.id)}
                  sent={sent.has(item.id)}
                  leadBusy={leadBusy.has(item.id)}
                  leadCreated={leadCreated.has(item.id)}
                  converting={converting === item.id}
                  onToggle={toggle}
                  onDraftChange={setDraft}
                  onGenerate={(m) => void generate(m)}
                  onSend={(m, text) => void send(m, text)}
                  onCreateLead={(m) => void createLead(m)}
                  onNotSpam={(m) => void markNotSpam(m)}
                  onTurnIntoPost={(m) => void turnIntoPost(m)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <ResponseStatsCard stats={stats} />
          <PlatformBreakdownCard items={items} now={now} />
          <QuickActionsCard
            onReplyPositive={() => setFilters(quickActionFilters('reply-positive'))}
            onFlagComplaints={() => setFilters(quickActionFilters('flag-complaints'))}
            onRequestReviews={() => navigate(`/create?prompt=${encodeURIComponent(REVIEW_REQUEST_PROMPT)}`)}
          />
        </div>
      </div>

      <MarkAllReadModal open={markAllOpen} count={stats.unread} busy={markingAll} onClose={() => setMarkAllOpen(false)} onConfirm={() => void markAllRead()} />
      <AutoReplyModal open={autoReplyOpen} onClose={() => setAutoReplyOpen(false)} />
    </PageCard>
  );
}
