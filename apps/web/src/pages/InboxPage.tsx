import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, CheckCheck, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { AutoReplyModal } from '../components/inbox/AutoReplySettings';
import { StatPill } from '../components/inbox/Badges';
import { FilterBar } from '../components/inbox/FilterBar';
import { PlatformBreakdownCard, QuickActionsCard, ResponseStatsCard } from '../components/inbox/InboxSidebar';
import { MarkAllReadModal } from '../components/inbox/MarkAllReadModal';
import { MessageCard } from '../components/inbox/MessageCard';
import { MessageSkeleton, NoAccess, NoMessages, NoResults } from '../components/inbox/MessageList';
import { Button, cn } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { PlanGatedNotice } from '../components/ui/PlanGatedNotice';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { can, PERMISSIONS } from '../lib/permissions';
import { ApiError, isPlanGated } from '../services/api';
import { inboxService, leadService } from '../services/inbox';
import {
  apiPlatform, appendPage, DEFAULT_FILTERS, draftFromSuggestions, filterMessages, INBOX_PAGE_SIZE, inboxStats, mergeFirstPage,
  nextInboxPage, quickActionFilters, REVIEW_REQUEST_PROMPT, toInboxItem, type DraftState, type InboxFilters, type InboxItem,
} from '../utils/inbox';

const POLL_MS = 60_000;
// Coming back to the tab refreshes only when the last load is older than this.
const MIN_GAP_MS = 55_000;
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
  // Inbox-wide, from the API: every message and the unread ones, not only the loaded pages.
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [planGated, setPlanGated] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
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
  // Bumped when a reply or mark starts and when it settles: a list request sent before then is stale.
  const mutations = useRef(0);
  const markAllRuns = useRef(0);
  const lastLoadAt = useRef(0);
  // Replies sent from this page, kept on screen until the server reports them.
  const repliedHere = useRef<Set<string>>(new Set());

  const mutated = () => { mutations.current += 1; };

  // Reloads the first page and keeps older pages already loaded. List failures stay silent, as in the
  // reference; a plan without the inbox gets the upgrade notice, a role without view_inbox a short notice.
  const load = useCallback(() => {
    const started = mutations.current;
    lastLoadAt.current = Date.now();
    return inboxService.list({ page: 1, pageSize: INBOX_PAGE_SIZE })
      .then((res) => {
        if (started !== mutations.current) return;
        setItems((prev) => mergeFirstPage(prev, res.items.map(toInboxItem), repliedHere.current));
        setTotal(res.total);
        setUnreadCount(res.unreadCount);
        setNow(Date.now());
        setPlanGated(null);
        setForbidden(false);
      })
      .catch((err: unknown) => {
        if (isPlanGated(err)) setPlanGated(err.message);
        else if (err instanceof ApiError && err.code === 'FORBIDDEN') setForbidden(true);
      })
      .finally(() => setLoading(false));
  }, []);

  // Polls every minute while the tab is visible, and once on return when the last load is stale.
  useEffect(() => {
    void load();
    const refreshIfDue = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadAt.current < MIN_GAP_MS) return;
      void load();
    };
    const id = setInterval(refreshIfDue, POLL_MS);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', refreshIfDue);
    };
  }, [load]);

  const loadMore = () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const started = mutations.current;
    const markAllBefore = markAllRuns.current;
    inboxService.list({ page: nextInboxPage(items.length), pageSize: INBOX_PAGE_SIZE })
      .then((res) => {
        // A "Mark all read" that finished meanwhile covers these older messages too.
        const older = res.items.map(toInboxItem).map((m) => (markAllRuns.current !== markAllBefore ? { ...m, isRead: true } : m));
        setItems((prev) => appendPage(prev, older));
        if (started === mutations.current) {
          setTotal(res.total);
          setUnreadCount(res.unreadCount);
        }
      })
      .catch(() => addToast({ type: 'error', title: 'Could not load more messages', message: 'Please try again.' }))
      .finally(() => setLoadingMore(false));
  };

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
      mutated();
      setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, isRead: true } : m)));
      setUnreadCount((c) => Math.max(0, c - 1));
      inboxService.markRead(item.id).then(inboxChanged).catch(() => {}).finally(mutated);
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
    mutated();
    setSending((s) => withId(s, item.id));
    try {
      const res = await inboxService.sendReply(item.id, text.trim());
      repliedHere.current.add(item.id);
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
      mutated();
      setSending((s) => withoutId(s, item.id));
    }
  };

  const createLead = async (item: InboxItem) => {
    mutated();
    setLeadBusy((s) => withId(s, item.id));
    try {
      await leadService.create({ customerName: item.customerName, sourcePlatform: apiPlatform(item.platform), sourceMessageId: item.id });
      setLeadCreated((s) => withId(s, item.id));
      setItems((prev) => prev.map((m) => (m.id === item.id && m.tag === 'general' ? { ...m, tag: 'lead' } : m)));
      addToast({ type: 'success', title: 'Lead created', message: `${item.customerName} added to your leads.` });
    } catch {
      addToast({ type: 'error', title: 'Failed to create lead', message: 'Please try again.' });
    } finally {
      mutated();
      setLeadBusy((s) => withoutId(s, item.id));
    }
  };

  const markNotSpam = async (item: InboxItem) => {
    mutated();
    try {
      await inboxService.updateTag(item.id, 'general');
      setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, tag: 'general' } : m)));
    } catch {
      addToast({ type: 'error', title: 'Could not update message', message: 'Please try again.' });
    } finally {
      mutated();
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
    mutated();
    setMarkingAll(true);
    try {
      await inboxService.markAllRead();
      markAllRuns.current += 1;
      setItems((prev) => prev.map((m) => ({ ...m, isRead: true })));
      setUnreadCount(0);
      setMarkAllOpen(false);
      inboxChanged();
      addToast({ type: 'success', title: 'Marked all read' });
    } catch {
      addToast({ type: 'error', title: 'Failed', message: 'Please try again.' });
    } finally {
      mutated();
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
              <StatPill value={unreadCount} label="unread" dot="bg-orange-500" strong={unreadCount > 0} />
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
          {unreadCount > 0 && (
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
          ) : forbidden ? (
            <NoAccess />
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
          {!loading && items.length > 0 && items.length < total && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <LoaderCircle className="w-4 h-4 animate-spin" />}
                Load more
              </Button>
              <span className="text-xs text-zinc-500">Showing {items.length} of {total}</span>
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

      <MarkAllReadModal open={markAllOpen} count={unreadCount} busy={markingAll} onClose={() => setMarkAllOpen(false)} onConfirm={() => void markAllRead()} />
      <AutoReplyModal open={autoReplyOpen} onClose={() => setAutoReplyOpen(false)} />
    </PageCard>
  );
}
