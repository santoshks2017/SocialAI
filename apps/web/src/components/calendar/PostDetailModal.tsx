import { useState } from 'react';
import { CalendarDays, Clock, Loader2, Trash2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PlatformIcon, type PlatformIconProps } from '../ui/PlatformIcon';
import { toLocalInput } from '../../utils/posts';
import { STATUS_LABELS, STATUS_STYLES, hourLabel, isReschedulable, tomorrowAt, type CalendarPost } from '../../utils/calendar';

const ICON_PLATFORMS = new Set(['facebook', 'instagram', 'gmb', 'youtube']);

function PlatformMark({ platform }: { platform: string }) {
  if (ICON_PLATFORMS.has(platform)) return <PlatformIcon platform={platform as PlatformIconProps['platform']} size="md" />;
  return <span className="text-[10px] font-bold uppercase text-zinc-500">{platform}</span>;
}

export function PostDetailModal({ post, canPublish, onClose, onCancel, onReschedule }: {
  post: CalendarPost;
  canPublish: boolean;
  onClose: () => void;
  onCancel: (id: string) => Promise<boolean>;
  onReschedule: (id: string, iso: string) => Promise<boolean>;
}) {
  const [now] = useState(() => new Date());
  const [view, setView] = useState<'details' | 'cancel'>('details');
  const [newTime, setNewTime] = useState(() => toLocalInput(post.date));
  const [busy, setBusy] = useState(false);
  // Rescheduling makes the post go live, which needs publish_post (the API answers 403 otherwise).
  const canReschedule = canPublish && isReschedulable(post.status);
  // Cancelling returns a scheduled post to drafts; a draft has no schedule to cancel.
  const canCancel = post.status === 'scheduled';
  const quickPicks = [9, 12, 18].map((hour) => ({ label: `Tomorrow ${hourLabel(hour)}`, value: toLocalInput(tomorrowAt(now, hour)) }));

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    try {
      if (await action()) onClose();
    } finally {
      setBusy(false);
    }
  };

  if (view === 'cancel') {
    return (
      <Modal
        isOpen
        onClose={onClose}
        title="Cancel this scheduled post?"
        variant="danger"
        size="sm"
        closeOnOverlayClick={!busy}
        closeOnEscape={!busy}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setView('details')} disabled={busy}>Keep post</Button>
            <Button variant="danger" onClick={() => void run(() => onCancel(post.id))} disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Cancel post
            </Button>
          </>
        )}
      >
        <p className="text-sm text-zinc-600">This post will not be published and will be removed from your schedule. It moves back to your drafts.</p>
        <p className="text-sm font-medium text-zinc-900 mt-3 line-clamp-2">{post.title}</p>
      </Modal>
    );
  }

  const footer = canCancel || canReschedule ? (
    <>
      {canCancel && (
        <Button variant="secondary" className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300" onClick={() => setView('cancel')} disabled={busy}>
          <Trash2 className="w-4 h-4" /> Cancel Post
        </Button>
      )}
      {canReschedule && (
        <Button onClick={() => void run(() => onReschedule(post.id, new Date(newTime).toISOString()))} disabled={busy || !newTime}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
          Confirm Reschedule
        </Button>
      )}
    </>
  ) : undefined;

  return (
    <Modal isOpen onClose={onClose} title={post.title} size="sm" footer={footer} closeOnOverlayClick={!busy} closeOnEscape={!busy}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full', STATUS_STYLES[post.status])}>{STATUS_LABELS[post.status]}</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            <CalendarDays className="w-3.5 h-3.5" />
            {post.date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        </div>
        {post.platforms.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {post.platforms.map((p) => <PlatformMark key={p} platform={p} />)}
          </div>
        )}
        {canReschedule && (
          <div className="space-y-2.5 pt-3 border-t border-zinc-100">
            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Reschedule</p>
            <div className="flex flex-wrap gap-1.5">
              {quickPicks.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  aria-pressed={newTime === q.value}
                  onClick={() => setNewTime(q.value)}
                  className={cn('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors', newTime === q.value ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-zinc-700 border-zinc-200 hover:border-orange-300 hover:text-orange-700')}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              min={toLocalInput(now)}
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              aria-label="New date and time"
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-orange-500/30"
            />
          </div>
        )}
        {post.status === 'published' && <p className="text-center text-xs text-zinc-400">Published — no actions available.</p>}
      </div>
    </Modal>
  );
}
