import { cn } from '../ui/Button';

const STATUS: Record<string, { label: string; badge: string; dot: string }> = {
  draft: { label: 'Draft', badge: 'bg-zinc-100 text-zinc-600', dot: 'bg-zinc-400' },
  pending_approval: { label: 'Awaiting approval', badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100', dot: 'bg-violet-500' },
  approved: { label: 'Ready to publish', badge: 'bg-teal-50 text-teal-700 ring-1 ring-teal-100', dot: 'bg-teal-500' },
  scheduled: { label: 'Scheduled', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', dot: 'bg-amber-500' },
  publishing: { label: 'Publishing', badge: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100', dot: 'bg-blue-500 animate-pulse' },
  published: { label: 'Published', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', dot: 'bg-emerald-500' },
  failed: { label: 'Failed', badge: 'bg-red-50 text-red-700 ring-1 ring-red-100', dot: 'bg-red-500' },
};

export function PostStatusBadge({ status }: { status: string }) {
  const meta = STATUS[status] ?? STATUS['draft']!;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap', meta.badge)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  );
}
