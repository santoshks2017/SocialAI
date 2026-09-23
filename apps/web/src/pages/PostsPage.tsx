import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { Button, cn } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { PageCard, PageHeader } from '../components/ui/PageCard';
import { PostRow, PostRowSkeleton } from '../components/posts/PostRow';
import { PostsEmptyState } from '../components/posts/PostsEmptyState';
import { ConfirmDialog, PostDetailDialog, RejectDialog, RescheduleDialog, type ConfirmKind } from '../components/posts/PostDialogs';
import { postService, type Post } from '../services/creative';
import { ApiError } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { can, PERMISSIONS } from '../lib/permissions';
import { POST_TABS, pageList, parsePostTab, type PostTab } from '../utils/posts';
import { publishErrorMessage, summarizePublishResult } from '../utils/publishResult';

const PAGE_SIZE = 15;
const POLL_MS = 4000;
const MAX_POLLS = 20; // about 80 seconds of watching a post that is publishing

export default function PostsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const { user } = useAuth();
  const canPublish = can(user, PERMISSIONS.PUBLISH_POST);
  const canApprove = can(user, PERMISSIONS.APPROVE_POST);

  const [tab, setTab] = useState<PostTab>(() => parsePostTab(searchParams.get('status')));
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [listKey, setListKey] = useState(0);
  const [countsKey, setCountsKey] = useState(0);
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; post: Post } | null>(null);
  const [rejecting, setRejecting] = useState<Post | null>(null);
  const [rescheduling, setRescheduling] = useState<Post | null>(null);
  const [viewing, setViewing] = useState<Post | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const polls = useRef(0);

  useEffect(() => {
    let cancelled = false;
    postService.list(tab === 'all' ? { page, pageSize: PAGE_SIZE } : { status: tab, page, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setPosts(res.data ?? []);
        setTotal(res.total ?? 0);
      })
      .catch(() => {
        if (!cancelled) addToast({ type: 'error', title: 'Load failed', message: 'Could not load posts. Please try again.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [tab, page, listKey, addToast]);

  useEffect(() => {
    postService.counts().then((res) => setCounts(res.counts)).catch(() => { /* tab counts are optional */ });
  }, [countsKey]);

  const refreshQuietly = useCallback(() => {
    setListKey((k) => k + 1);
    setCountsKey((k) => k + 1);
  }, []);

  // Keep watching while any visible post is publishing, then stop.
  const hasPublishing = posts.some((p) => p.status === 'publishing');
  useEffect(() => {
    if (!hasPublishing) {
      polls.current = 0;
      return;
    }
    if (polls.current >= MAX_POLLS) return;
    const timer = window.setTimeout(() => {
      polls.current += 1;
      refreshQuietly();
    }, POLL_MS);
    return () => window.clearTimeout(timer);
  }, [hasPublishing, posts, refreshQuietly]);

  const switchTab = (next: PostTab) => {
    if (next === tab) return;
    setTab(next);
    setPage(1);
    setLoading(true);
  };
  const goToPage = (next: number) => {
    setPage(next);
    setLoading(true);
  };
  const refreshAll = () => {
    setLoading(true);
    refreshQuietly();
  };

  const publish = async (post: Post, retry: boolean) => {
    const failTitle = retry ? 'Retry failed' : 'Publish failed';
    try {
      const res = await postService.publish(post.id, post.platforms);
      const outcome = summarizePublishResult(res, post.platforms);
      if (!outcome.ok) {
        addToast({ type: 'error', title: failTitle, message: outcome.message ?? 'Could not publish. Check your platform connections.' });
      } else if (outcome.message) {
        addToast({ type: 'warning', title: 'Partly published', message: outcome.message });
      } else {
        addToast(retry
          ? { type: 'success', title: 'Re-published', message: 'The post is being published again.' }
          : { type: 'success', title: 'Publishing', message: 'Your post is being published to the selected platforms.' });
      }
    } catch (err) {
      addToast({ type: 'error', title: failTitle, message: publishErrorMessage(err, 'Could not publish. Check your platform connections.') });
    }
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    const { kind, post } = confirm;
    try {
      if (kind === 'publish' || kind === 'retry') {
        await publish(post, kind === 'retry');
      } else if (kind === 'delete') {
        await postService.delete(post.id)
          .then(() => addToast({ type: 'success', title: 'Post deleted', message: 'The post has been removed.' }))
          .catch(() => addToast({ type: 'error', title: 'Delete failed', message: 'Could not delete the post. Try again.' }));
      } else {
        await postService.cancelSchedule(post.id)
          .then(() => addToast({ type: 'success', title: 'Schedule cancelled', message: 'The post was moved back to drafts.' }))
          .catch(() => addToast({ type: 'error', title: 'Cancel failed', message: 'Could not cancel the schedule. Try again.' }));
      }
    } finally {
      setConfirm(null);
      refreshQuietly();
    }
  };

  const approve = async (post: Post) => {
    setApprovingId(post.id);
    try {
      await postService.approve(post.id);
      addToast({ type: 'success', title: 'Post approved', message: "It's now ready to publish — open the Ready tab to publish it." });
    } catch (err) {
      addToast({ type: 'error', title: 'Approve failed', message: err instanceof ApiError ? err.message : 'Could not approve. Try again.' });
    } finally {
      setApprovingId(null);
      refreshQuietly();
    }
  };

  const reject = async (post: Post, reason: string) => {
    try {
      await postService.reject(post.id, reason.trim());
      addToast({ type: 'success', title: 'Post rejected', message: 'The post has been sent back to drafts.' });
    } catch {
      addToast({ type: 'error', title: 'Reject failed', message: 'Could not reject the post. Try again.' });
    } finally {
      setRejecting(null);
      refreshQuietly();
    }
  };

  const reschedule = async (post: Post, isoTime: string) => {
    try {
      await postService.reschedule(post.id, isoTime);
      addToast({ type: 'success', title: 'Rescheduled', message: 'The post will publish at the new time.' });
    } catch {
      addToast({ type: 'error', title: 'Reschedule failed', message: 'Could not reschedule. Try again.' });
    } finally {
      setRescheduling(null);
      refreshQuietly();
    }
  };

  const submitForApproval = async (post: Post) => {
    try {
      await postService.submitForApproval(post.id);
      addToast({ type: 'success', title: 'Sent for approval', message: 'Your approver has been notified with the review link.' });
    } catch (err) {
      addToast({ type: 'error', title: 'Could not send for approval', message: err instanceof ApiError ? err.message : 'Please try again.' });
    } finally {
      refreshQuietly();
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const subtitle = total > 0 ? `${total} ${total === 1 ? 'post' : 'posts'} across your social channels` : 'Create and manage your social posts';

  return (
    <PageCard>
      <PageHeader
        title="Posts"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="secondary" className="px-2.5" disabled={loading} aria-label="Refresh posts" title="Refresh" onClick={refreshAll}>
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            <Button onClick={() => navigate('/create')}><Plus className="w-4 h-4" /> New Post</Button>
          </>
        }
      />

      <div className="flex mb-4 overflow-x-auto">
        <div className="inline-flex gap-1 bg-zinc-100/80 rounded-xl p-1" role="tablist">
          {POST_TABS.map(({ id, label }) => {
            const active = id === tab;
            const count = id === 'all' ? 0 : counts[id] ?? 0;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchTab(id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0',
                  active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800',
                )}
              >
                {label}
                {count > 0 && (
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', active ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-200/70 text-zinc-500')}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }, (_, i) => <PostRowSkeleton key={i} />)}
        </div>
      ) : posts.length === 0 ? (
        <PostsEmptyState status={tab} onCreate={() => navigate('/create')} />
      ) : (
        <>
          <div className="space-y-2.5">
            {posts.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                canPublish={canPublish}
                canApprove={canApprove}
                approving={approvingId === post.id}
                onOpen={setViewing}
                onEdit={(p) => navigate(`/create?edit=${p.id}&prompt=${encodeURIComponent(p.prompt_text ?? '')}`)}
                onConfirm={(kind, p) => setConfirm({ kind, post: p })}
                onApprove={approve}
                onReject={setRejecting}
                onReschedule={setRescheduling}
                onSubmitForApproval={submitForApproval}
              />
            ))}
          </div>
          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} total={total} onPage={goToPage} />}
        </>
      )}

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} onConfirm={runConfirmed} />
      <RejectDialog post={rejecting} onClose={() => setRejecting(null)} onReject={reject} />
      <RescheduleDialog post={rescheduling} onClose={() => setRescheduling(null)} onReschedule={reschedule} />
      <PostDetailDialog post={viewing} onClose={() => setViewing(null)} />
    </PageCard>
  );
}

function Pagination({ page, totalPages, total, onPage }: { page: number; totalPages: number; total: number; onPage: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t border-zinc-100 flex-wrap gap-3">
      <p className="text-xs text-zinc-400">
        Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="secondary" className="h-8 px-2 text-xs" disabled={page === 1} aria-label="Previous page" onClick={() => onPage(page - 1)}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>
        {pageList(page, totalPages).map((n, i) => n === '...' ? (
          <span key={`gap-${i}`} className="px-1.5 text-xs text-zinc-300">…</span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onPage(n)}
            className={cn('h-8 min-w-8 px-2 rounded-lg text-xs font-semibold transition-colors', n === page ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100')}
          >
            {n}
          </button>
        ))}
        <Button variant="secondary" className="h-8 px-2 text-xs" disabled={page === totalPages} aria-label="Next page" onClick={() => onPage(page + 1)}>
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
