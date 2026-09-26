import type { ReactNode } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';

// The reference's Settings building blocks: cards, section header, icon tile, label, toggle, stat pill and sticky save bar.

export function SettingsCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-5 sm:p-6', className)}>{children}</div>;
}

/** A card whose rows pad themselves, for lists. */
export function SettingsListCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('bg-white rounded-2xl border border-zinc-200/80 shadow-sm divide-y divide-zinc-100 overflow-hidden', className)}>
      {children}
    </div>
  );
}

/** The brand-tinted square behind a section's icon. A span, so it can sit inside a button. */
export function IconTile({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('w-8 h-8 rounded-lg bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0', className)}>
      {children}
    </span>
  );
}

/**
 * Icon tile, title and description. A card section uses the default h3; a tab's own header card passes
 * level 2, with its main `action` (a button or link) on the right and optional `stats` pills below.
 */
export function SectionHeader({ icon, title, description, level = 3, action, stats, className }: {
  icon: ReactNode;
  title: string;
  description?: string;
  level?: 2 | 3;
  action?: ReactNode;
  stats?: ReactNode;
  className?: string;
}) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div className={cn('mb-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <IconTile className="mt-0.5">{icon}</IconTile>
          <div>
            <Heading className={cn('font-semibold text-zinc-900', level === 2 ? 'text-base' : 'text-sm')}>{title}</Heading>
            {description && <p className={cn('text-xs text-zinc-500 mt-0.5', level === 2 && 'max-w-xl')}>{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {stats && <div className="flex flex-wrap gap-2 mt-4">{stats}</div>}
    </div>
  );
}

export function FieldLabel({ children, htmlFor, icon }: { children: ReactNode; htmlFor?: string; icon?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-xs font-medium text-zinc-600 mb-1.5', icon ? 'flex items-center gap-1.5' : undefined)}>
      {icon}
      {children}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-orange-600' : 'bg-zinc-200',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

export function StatPill({ value, label }: { value: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg bg-zinc-50 ring-1 ring-zinc-100 px-2.5 py-1">
      <span className="text-sm font-bold text-zinc-900">{value}</span>
      <span className="text-[11px] text-zinc-500">{label}</span>
    </span>
  );
}

export function SaveBar({ saved, label, onSave, disabled, busy }: { saved: boolean; label: string; onSave: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <div className="sticky bottom-0 -mx-px flex items-center justify-end gap-3 bg-zinc-50/80 backdrop-blur-sm border-t border-zinc-100 py-3 mt-2">
      {saved && (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <Check className="w-4 h-4" /> Saved
        </span>
      )}
      <Button onClick={onSave} disabled={disabled || busy}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {label}
      </Button>
    </div>
  );
}
