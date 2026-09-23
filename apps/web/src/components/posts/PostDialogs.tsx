import { useState } from 'react';
import { ExternalLink, LoaderCircle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import type { Post } from '../../services/creative';
import { metricTotals, platformResults, postTimeline, toLocalInput } from '../../utils/posts';
import { PostStatusBadge } from './PostStatusBadge';
import { PlatformList } from './PlatformList';

export type ConfirmKind = 'publish' | 'retry' | 'delete' | 'cancel';

function confirmCopy(kind: ConfirmKind, post: Post) {
  const n = post.platforms?.length ?? 0;
  switch (kind) {
    case 'delete':
      return { title: 'Delete this post?', body: 'This permanently removes the post and its content. This action cannot be undone.', label: 'Delete post', keep: 'Keep post', danger: true };
    case 'cancel':
      return { title: 'Cancel scheduled post?', body: 'This post will not be published and will be removed from your schedule.', label: 'Cancel post', keep: 'Keep post', danger: true };
    case 'publish':
      return { title: 'Publish now?', body: `This post will be published immediately to ${n || 'the selected'} connected platform${n === 1 ? '' : 's'}.`, label: 'Publish now', keep: 'Not now', danger: false };
    case 'retry':
      return { title: 'Retry publishing?', body: 'We will attempt to publish this post again. Make sure your platform connections are still active.', label: 'Retry publishing', keep: 'Not now', danger: false };
  }
}

export function ConfirmDialog({ confirm, onClose, onConfirm }: {
  confirm: { kind: ConfirmKind; post: Post } | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!confirm) return null;
  const copy = confirmCopy(confirm.kind, confirm.post);
  const run = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      title={copy.title}
      size="sm"
      variant={copy.danger ? 'danger' : 'default'}
      closeOnOverlayClick={!busy}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>{copy.keep}</Button>
        <Button variant={copy.danger ? 'danger' : 'primary'} disabled={busy} onClick={run}>
          {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}{copy.label}
        </Button>
      </>}
    >
      <p className="text-sm text-zinc-600 leading-relaxed">{copy.body}</p>
      <p className="mt-3 text-xs text-zinc-400 line-clamp-1">{confirm.post.prompt_text || 'Untitled post'}</p>
    </Modal>
  );
}

export function RejectDialog({ post, onClose, onReject }: {
  post: Post | null;
  onClose: () => void;
  onReject: (post: Post, reason: string) => Promise<void>;
}) {
  if (!post) return null;
  return <RejectForm key={post.id} post={post} onClose={onClose} onReject={onReject} />;
}

function RejectForm({ post, onClose, onReject }: { post: Post; onClose: () => void; onReject: (post: Post, reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onReject(post, reason); } finally { setBusy(false); }
  };
  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      title="Reject this post"
      description="The post will be sent back to drafts so it can be revised and resubmitted."
      size="md"
      closeOnOverlayClick={!busy}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button variant="danger" disabled={busy} onClick={submit}>
          {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}Reject post
        </Button>
      </>}
    >
      <label htmlFor="reject-reason" className="block text-xs font-semibold text-zinc-600 mb-1.5">
        Reason <span className="font-normal text-zinc-400">(optional)</span>
      </label>
      <textarea
        id="reject-reason"
        rows={3}
        maxLength={1000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Let the author know what needs to change…"
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30 resize-none"
      />
    </Modal>
  );
}

export function RescheduleDialog({ post, onClose, onReschedule }: {
  post: Post | null;
  onClose: () => void;
  onReschedule: (post: Post, isoTime: string) => Promise<void>;
}) {
  if (!post) return null;
  return <RescheduleForm key={post.id} post={post} onClose={onClose} onReschedule={onReschedule} />;
}

function RescheduleForm({ post, onClose, onReschedule }: { post: Post; onClose: () => void; onReschedule: (post: Post, isoTime: string) => Promise<void> }) {
  const [value, setValue] = useState(() =>
    toLocalInput(post.scheduled_at ? new Date(post.scheduled_at) : new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [min] = useState(() => toLocalInput(new Date()));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!value) return;
    setBusy(true);
    try { await onReschedule(post, new Date(value).toISOString()); } finally { setBusy(false); }
  };
  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      title="Reschedule post"
      description="Pick a new date and time. The post stays scheduled and will publish then."
      size="sm"
      closeOnOverlayClick={!busy}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button disabled={busy || !value} onClick={submit}>
          {busy && <LoaderCircle className="w-4 h-4 animate-spin" />}Reschedule
        </Button>
      </>}
    >
      <input
        type="datetime-local"
        aria-label="New date and time"
        value={value}
        min={min}
        onChange={(e) => setValue(e.target.value)}
        className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:ring-2 focus:ring-orange-500/30 focus:border-zinc-400 focus:outline-none"
      />
    </Modal>
  );
}

export function PostDetailDialog({ post, onClose }: { post: Post | null; onClose: () => void }) {
  if (!post) return null;
  const creatives = Object.entries(post.creative_urls ?? {}).filter(([, url]) => !!url);
  const results = platformResults(post.publish_results);
  const metrics = metricTotals(post.metrics);
  const hasMetrics = metrics.reach > 0 || metrics.likes > 0 || metrics.comments > 0;

  return (
    <Modal isOpen onClose={onClose} title={post.prompt_text || 'Untitled post'} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <PostStatusBadge status={post.status} />
          <PlatformList platforms={post.platforms} />
          <span className="text-xs text-zinc-400">· {postTimeline(post)}</span>
        </div>

        {creatives.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {creatives.map(([platform, url]) => (
              <img key={platform} src={url} alt={platform} className="w-28 h-28 object-cover rounded-lg ring-1 ring-zinc-200" />
            ))}
          </div>
        )}

        {post.caption_text && (
          <div>
            <p className="text-xs font-semibold text-zinc-500 mb-1">Caption</p>
            <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">{post.caption_text}</p>
          </div>
        )}

        {post.caption_hashtags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.caption_hashtags.map((tag, i) => (
              <span key={`${tag}-${i}`} className="text-[11px] font-medium text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        )}

        {results.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-zinc-500 mb-1.5">Per-platform result</p>
            <div className="space-y-1.5">
              {results.map((r) => (
                <div key={r.platform} className="flex items-center justify-between gap-2 text-xs border border-zinc-100 rounded-lg px-3 py-2">
                  <span className="font-semibold capitalize text-zinc-700">{r.platform}</span>
                  {r.error ? (
                    <span className="text-red-600 truncate">{r.error}</span>
                  ) : r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-medium inline-flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" /> View post
                    </a>
                  ) : (
                    <span className="text-emerald-700">Published</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasMetrics && (
          <div className="grid grid-cols-3 gap-2">
            {([['Reach', metrics.reach], ['Likes', metrics.likes], ['Comments', metrics.comments]] as const).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-2.5 text-center">
                <p className="text-base font-bold text-zinc-900">{value}</p>
                <p className="text-[11px] text-zinc-400">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
