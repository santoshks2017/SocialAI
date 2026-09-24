import { Star } from 'lucide-react';
import { cn } from '../ui/Button';
import type { InboxTag, Sentiment } from '../../utils/inbox';

const BADGE = 'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap';

const SENTIMENTS: Record<Sentiment, { label: string; className: string; dot: string }> = {
  positive: { label: 'Positive', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', dot: 'bg-emerald-500' },
  neutral: { label: 'Neutral', className: 'bg-zinc-100 text-zinc-600', dot: 'bg-zinc-400' },
  negative: { label: 'Negative', className: 'bg-red-50 text-red-700 ring-1 ring-red-100', dot: 'bg-red-500' },
};

const TAGS: Record<Exclude<InboxTag, 'general'>, { label: string; className: string }> = {
  lead: { label: 'Lead', className: 'bg-green-50 text-green-700 ring-1 ring-green-100' },
  complaint: { label: 'Complaint', className: 'bg-red-50 text-red-700 ring-1 ring-red-100' },
  spam: { label: 'Spam', className: 'bg-zinc-100 text-zinc-500' },
};

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const s = SENTIMENTS[sentiment];
  return (
    <span className={cn(BADGE, s.className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

// "general" has no badge, as in the reference.
export function TagBadge({ tag }: { tag: InboxTag }) {
  if (tag === 'general') return null;
  const t = TAGS[tag];
  return <span className={cn(BADGE, t.className)}>{t.label}</span>;
}

export function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'xs' }) {
  const star = size === 'xs' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn(star, i <= Math.round(rating) ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-200 fill-zinc-200')} />
      ))}
    </span>
  );
}

// Header stat pill: value, then a lowercase label ("unread", "replied", "★ avg", "response rate").
export function StatPill({ value, label, dot, strong = false }: { value: string | number; label: string; dot: string; strong?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-lg ring-1 px-2.5 py-1', strong ? 'bg-orange-50 ring-orange-100' : 'bg-zinc-50 ring-zinc-100')}>
      <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
      <span className="text-sm font-bold text-zinc-900">{value}</span>
      <span className="text-[11px] text-zinc-500">{label}</span>
    </span>
  );
}
