import { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { postService } from '../services/creative';
import type { Post } from '../services/creative';
import { useToast } from '../components/ui/Toast';
import { summarizePublishResult, publishErrorMessage } from '../utils/publishResult';
import { useAuth } from '../contexts/AuthContext';
import { can, PERMISSIONS } from '../lib/permissions';
import {
  Plus, RefreshCw, Send, Trash2, Clock, CheckCircle2,
  AlertCircle, FileText, ChevronLeft, ChevronRight,
  ExternalLink, MoreHorizontal, X,
} from 'lucide-react';

type StatusFilter = 'all' | 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

const TABS: { id: StatusFilter; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'draft',     label: 'Drafts' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'failed',    label: 'Failed' },
];

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  draft:      { label: 'Draft',      dot: 'bg-slate-300',  badge: 'bg-slate-100 text-slate-600' },
  scheduled:  { label: 'Scheduled',  dot: 'bg-yellow-400', badge: 'bg-yellow-50 text-yellow-700 border border-yellow-200' },
  publishing: { label: 'Publishing', dot: 'bg-blue-400 animate-pulse', badge: 'bg-blue-50 text-blue-700' },
  published:  { label: 'Published',  dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700 border border-green-200' },
  failed:     { label: 'Failed',     dot: 'bg-red-500',    badge: 'bg-red-50 text-red-600 border border-red-200' },
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'FB', instagram: 'IG', gmb: 'GMB',
};
const PLATFORM_COLORS: Record<string, string> = {
  facebook: 'bg-blue-100 text-blue-700',
  instagram: 'bg-pink-100 text-pink-700',
  gmb: 'bg-green-100 text-green-700',
};

const GRADIENT_BY_STATUS: Record<string, string> = {
  draft:      'from-slate-700 to-slate-600',
  scheduled:  'from-yellow-700 to-orange-600',
  publishing: 'from-blue-700 to-blue-600',
  published:  'from-teal-700 to-teal-600',
  failed:     'from-red-800 to-red-700',
};

function timeLabel(post: Post): string {
  if (post.status === 'scheduled' && post.scheduled_at) {
    const d = new Date(post.scheduled_at);
    return `Scheduled ${d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
  }
  if (post.status === 'published' && post.published_at) {
    const d = new Date(post.published_at);
    return `Published ${d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
  }
  const d = new Date(post.created_at);
  return `Created ${d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

interface PostCardProps {
  post: Post;
  canPublish: boolean;
  onPublishNow: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCancelSchedule: (id: string) => Promise<void>;
}

function PostCard({ post, canPublish, onPublishNow, onDelete, onCancelSchedule }: PostCardProps) {
  const [acting, setAct] = useState<string | null>(null);
  const navigate = useNavigate();
  const cfg = STATUS_CONFIG[post.status] ?? STATUS_CONFIG['draft']!;
  const gradient = GRADIENT_BY_STATUS[post.status] ?? 'from-slate-700 to-slate-600';

  const act = async (key: string, fn: () => Promise<void>) => {
    setAct(key);
    try { await fn(); } finally { setAct(null); }
  };

  const publishUrls = post.creative_urls as Record<string, string> | undefined;
  const firstUrl = publishUrls ? Object.values(publishUrls).find(Boolean) : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex overflow-hidden hover:shadow-md transition-shadow">
      {/* Thumbnail strip */}
      <div className={`w-2 flex-shrink-0 bg-gradient-to-b ${gradient}`} />

      {/* Image/gradient placeholder */}
      <div className={`w-20 flex-shrink-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        <FileText className="w-6 h-6 text-white/40" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-start gap-2 mb-1.5">
          <p className="text-sm font-semibold text-slate-800 leading-snug flex-1 line-clamp-1">
            {post.prompt_text || 'Untitled Post'}
          </p>
          <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
            {cfg.label}
          </span>
        </div>

        {post.caption_text && (
          <p className="text-xs text-slate-400 line-clamp-2 mb-2 leading-relaxed">
            {post.caption_text}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {/* Platform badges */}
          {(post.platforms ?? []).map((p) => (
            <span key={p} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PLATFORM_COLORS[p] ?? 'bg-slate-100 text-slate-600'}`}>
              {PLATFORM_LABELS[p] ?? p.toUpperCase()}
            </span>
          ))}
          <span className="text-[11px] text-slate-400 ml-1">{timeLabel(post)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 px-4 flex-shrink-0">
        {post.status === 'draft' && (
          <>
            {canPublish && <button
              onClick={() => act('publish', () => onPublishNow(post.id))}
              disabled={!!acting}
              className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors"
            >
              {acting === 'publish' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Publish
            </button>}
            <button
              onClick={() => navigate(`/create?prompt=${encodeURIComponent(post.prompt_text ?? '')}`)}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Edit
            </button>
          </>
        )}

        {post.status === 'scheduled' && (
          <button
            onClick={() => act('cancel', () => onCancelSchedule(post.id))}
            disabled={!!acting}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {acting === 'cancel' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            Cancel
          </button>
        )}

        {post.status === 'published' && firstUrl && (
          <a
            href={firstUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-teal-600 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View
          </a>
        )}

        {post.status === 'failed' && canPublish && (
          <button
            onClick={() => act('retry', () => onPublishNow(post.id))}
            disabled={!!acting}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {acting === 'retry' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Retry
          </button>
        )}

        <button
          onClick={() => act('delete', () => onDelete(post.id))}
          disabled={!!acting || post.status === 'publishing'}
          className="p-1.5 text-slate-300 hover:text-red-500 disabled:opacity-30 transition-colors rounded-lg hover:bg-red-50"
          title="Delete post"
        >
          {acting === 'delete' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ status }: { status: StatusFilter }) {
  const msgs: Record<StatusFilter, { icon: React.ReactNode; title: string; sub: string }> = {
    all:       { icon: <FileText className="w-8 h-8 text-slate-300" />,       title: 'No posts yet',          sub: 'Create your first post to get started.' },
    draft:     { icon: <FileText className="w-8 h-8 text-slate-300" />,       title: 'No drafts',             sub: 'Drafts appear here when you save without publishing.' },
    scheduled: { icon: <Clock className="w-8 h-8 text-yellow-300" />,         title: 'Nothing scheduled',     sub: 'Use the schedule option when creating a post.' },
    publishing:{ icon: <MoreHorizontal className="w-8 h-8 text-blue-300" />,  title: 'Nothing publishing',    sub: 'Posts in flight will appear here.' },
    published:  { icon: <CheckCircle2 className="w-8 h-8 text-green-300" />,  title: 'No published posts',    sub: 'Published posts will appear here.' },
    failed:    { icon: <AlertCircle className="w-8 h-8 text-red-300" />,      title: 'No failed posts',       sub: 'Great — nothing went wrong.' },
  };
  const { icon, title, sub } = msgs[status];
  return (
    <div className="text-center py-16">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="text-xs text-slate-400 mt-1 mb-4">{sub}</p>
      {(status === 'all' || status === 'draft') && (
        <NavLink
          to="/create"
          className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Create Post
        </NavLink>
      )}
    </div>
  );
}

const PAGE_SIZE = 15;

export default function PostsPage() {
  const [activeTab, setActiveTab] = useState<StatusFilter>('all');
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [tabCounts, setTabCounts] = useState<Partial<Record<StatusFilter, number>>>({});
  const { addToast } = useToast();
  const { user } = useAuth();
  const canPublish = can(user, PERMISSIONS.PUBLISH_POST);

  const fetch = useCallback(async (tab: StatusFilter, p: number) => {
    setLoading(true);
    try {
      const params = tab === 'all' ? { page: p, pageSize: PAGE_SIZE } : { status: tab, page: p, pageSize: PAGE_SIZE };
      const res = await postService.list(params);
      setPosts(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch {
      addToast({ type: 'error', title: 'Load failed', message: 'Could not load posts. Please try again.' });
    } finally {
      setLoading(false);
    }
  }, []);

  // Tab counts: one lightweight request per status
  const refreshCounts = useCallback(() => {
    const statuses: StatusFilter[] = ['draft', 'scheduled', 'published', 'failed'];
    statuses.forEach((s) => {
      postService.list({ status: s, page: 1, pageSize: 1 })
        .then((res) => setTabCounts((prev) => ({ ...prev, [s]: res.total ?? 0 })))
        .catch(() => {});
    });
  }, []);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  useEffect(() => { fetch(activeTab, page); }, [activeTab, page, fetch]);

  const handleTabChange = (tab: StatusFilter) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handlePublishNow = async (id: string) => {
    const post = posts.find((p) => p.id === id);
    if (!post) return;
    try {
      const res = await postService.publish(id, post.platforms);
      const outcome = summarizePublishResult(res, post.platforms);
      if (!outcome.ok) {
        addToast({ type: 'error', title: 'Publish failed', message: outcome.message ?? 'Could not publish.' });
      } else if (outcome.message) {
        addToast({ type: 'warning', title: 'Partly published', message: outcome.message });
      } else {
        addToast({ type: 'success', title: 'Publishing!', message: 'Post is being published to selected platforms.' });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Publish failed', message: publishErrorMessage(err, 'Could not publish. Check platform connections.') });
    }
    // Status changes on failure too (e.g. draft → failed), so always reload.
    await fetch(activeTab, page);
    refreshCounts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    try {
      await postService.delete(id);
      addToast({ type: 'success', title: 'Deleted', message: 'Post deleted.' });
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      refreshCounts();
    } catch (err) {
      addToast({ type: 'error', title: 'Delete failed', message: err instanceof Error && err.message ? err.message : 'Could not delete post. Try again.' });
    }
  };

  const handleCancelSchedule = async (id: string) => {
    try {
      await postService.cancelSchedule(id);
      addToast({ type: 'success', title: 'Schedule cancelled', message: 'The post is back in your drafts.' });
      await fetch(activeTab, page);
      refreshCounts();
    } catch (err) {
      addToast({ type: 'error', title: 'Cancel failed', message: err instanceof Error && err.message ? err.message : 'Could not cancel. Try again.' });
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Posts</h1>
          <p className="text-sm text-slate-400 mt-0.5">{total > 0 ? `${total} post${total !== 1 ? 's' : ''}` : 'Manage your content'}</p>
        </div>
        <NavLink
          to="/create"
          className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> New Post
        </NavLink>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 mb-5 overflow-x-auto">
        {TABS.map((tab) => {
          const count = tab.id === 'all' ? undefined : tabCounts[tab.id];
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {tab.label}
              {count !== undefined && count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <EmptyState status={activeTab} />
      ) : (
        <>
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                canPublish={canPublish}
                onPublishNow={handlePublishNow}
                onDelete={handleDelete}
                onCancelSchedule={handleCancelSchedule}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400">
                Page {page} of {totalPages} · {total} total
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
