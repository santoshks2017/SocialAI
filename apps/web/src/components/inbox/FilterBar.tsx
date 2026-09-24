import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../ui/Button';
import { platformCounts, sentimentCounts, typeCounts, type InboxFilters, type InboxItem, type TypeFilter } from '../../utils/inbox';

interface Option {
  value: string;
  label: string;
}

// The reference's inline filter dropdown: the closed trigger shows the chosen option, and screen readers hear
// "<label>: <option>". Options are plain toggle buttons (aria-pressed); there is no arrow-key listbox pattern.
function FilterDropdown({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? options[0];
  const selectedLabel = selected?.label ?? '';
  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`${label}: ${selectedLabel}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 h-9 pl-3 pr-2 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500/30',
          value !== 'all' ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 focus:border-zinc-400',
        )}
      >
        {selectedLabel}
        <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 min-w-[180px] bg-white rounded-xl border border-zinc-200 shadow-lg py-1">
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={cn(
                  'w-full text-left flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium transition-colors',
                  isSelected ? 'bg-orange-50/60 text-orange-700' : 'text-zinc-600 hover:bg-zinc-50',
                )}
              >
                {o.label}
                {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FilterBar({ items, filters, onChange }: { items: InboxItem[]; filters: InboxFilters; onChange: (next: InboxFilters) => void }) {
  const types = typeCounts(items);
  const platforms = platformCounts(items);
  const sentiments = sentimentCounts(items);
  const tabs: Array<{ id: TypeFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'review', label: `Reviews · ${types.review}` },
    { id: 'comment', label: `Comments · ${types.comment}` },
    { id: 'dm', label: `DMs · ${types.dm}` },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex max-w-full overflow-x-auto gap-1 bg-zinc-100/80 rounded-xl p-1" role="group" aria-label="Message type">
        {tabs.map((tab) => {
          const active = filters.type === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange({ ...filters, type: tab.id })}
              className={cn('px-3 py-1.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-all', active ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 ml-auto">
        <FilterDropdown
          label="Platform"
          value={filters.platform}
          onChange={(v) => onChange({ ...filters, platform: v as InboxFilters['platform'] })}
          options={[
            { value: 'all', label: 'All platforms' },
            { value: 'google', label: `Google · ${platforms.google}` },
            { value: 'facebook', label: `Facebook · ${platforms.facebook}` },
            { value: 'instagram', label: `Instagram · ${platforms.instagram}` },
            { value: 'youtube', label: `YouTube · ${platforms.youtube}` },
          ]}
        />
        <FilterDropdown
          label="Sentiment"
          value={filters.sentiment}
          onChange={(v) => onChange({ ...filters, sentiment: v as InboxFilters['sentiment'] })}
          options={[
            { value: 'all', label: 'All sentiment' },
            { value: 'positive', label: `Positive · ${sentiments.positive}` },
            { value: 'neutral', label: `Neutral · ${sentiments.neutral}` },
            { value: 'negative', label: `Negative · ${sentiments.negative}` },
          ]}
        />
        <FilterDropdown
          label="Status"
          value={filters.status}
          onChange={(v) => onChange({ ...filters, status: v as InboxFilters['status'] })}
          options={[
            { value: 'all', label: 'All status' },
            { value: 'pending', label: 'Unresponded' },
            { value: 'responded', label: 'Responded' },
          ]}
        />
      </div>
    </div>
  );
}
