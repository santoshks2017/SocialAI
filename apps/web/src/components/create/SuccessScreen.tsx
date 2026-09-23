import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleCheck } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { postService } from '../../services/creative';
import { deliveryRows, platformLabel, type DeliveryRow } from '../../utils/createStudio';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];

export interface CreateOutcome {
  kind: 'scheduled' | 'approval' | 'published';
  postId: string;
  platforms: string[];
  isVideo: boolean;
  warning: string | null;
  whatsappShare: string | null;
}

const TITLES: Record<CreateOutcome['kind'], string> = { scheduled: 'Scheduled', approval: 'Sent for approval', published: 'Published' };
const TEXT: Record<CreateOutcome['kind'], string> = {
  scheduled: 'It will go out automatically at your chosen time.',
  approval: 'Your approver has been notified with the review link.',
  published: 'Your content is being delivered to the selected platforms.',
};
const POLL_MS = 5000;
const MAX_POLLS = 24; // about 2 minutes: video uploads finish in the background (cron)

export function SuccessScreen({ outcome, onCreateAnother }: { outcome: CreateOutcome; onCreateAnother: () => void }) {
  const navigate = useNavigate();
  const track = outcome.kind === 'published' && outcome.isVideo;
  const [rows, setRows] = useState<DeliveryRow[] | null>(() => (track ? deliveryRows(outcome.platforms, null) : null));

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      polls += 1;
      try {
        const { data } = await postService.get(outcome.postId);
        if (cancelled) return;
        const next = deliveryRows(outcome.platforms, data);
        setRows(next);
        if (next.every((r) => r.status !== 'uploading')) return;
      } catch {
        // A failed status request doesn't mean the upload failed; keep polling.
      }
      if (!cancelled && polls < MAX_POLLS) timer = setTimeout(() => { void poll(); }, POLL_MS);
    };
    timer = setTimeout(() => { void poll(); }, POLL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [track, outcome.postId, outcome.platforms]);

  return (
    <div className="flex-1 min-h-0 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 grid place-items-center mb-4">
          <CircleCheck className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-900">{TITLES[outcome.kind]}</h2>
        <p className="text-sm text-zinc-500 mt-1">{TEXT[outcome.kind]}</p>
        {outcome.warning && <p className="text-xs text-amber-700 mt-2">{outcome.warning}</p>}
        {rows && (
          <div className="mt-3 space-y-1.5 text-left">
            {rows.map((r) => (
              <div key={r.platform} className="flex items-center gap-2 text-sm">
                <PlatformIcon platform={r.platform as IconPlatform} size="sm" />
                <span className="text-zinc-700">{platformLabel(r.platform)}</span>
                <span className={cn('ml-auto text-xs font-semibold', r.status === 'live' ? 'text-emerald-600' : r.status === 'failed' ? 'text-red-600' : 'text-amber-600')}>
                  {r.status === 'live' ? 'Live' : r.status === 'failed' ? 'Failed' : 'Uploading'}
                </span>
                {r.status === 'live' && r.url && (
                  <a href={r.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-orange-600">View →</a>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          <Button variant="secondary" onClick={() => navigate('/posts')}>Go to Posts</Button>
          {outcome.kind === 'approval' && outcome.whatsappShare && (
            <a
              href={outcome.whatsappShare}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center h-9 px-3.5 text-sm font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            >
              Share on WhatsApp
            </a>
          )}
          <Button onClick={onCreateAnother}>Create another</Button>
        </div>
      </div>
    </div>
  );
}
