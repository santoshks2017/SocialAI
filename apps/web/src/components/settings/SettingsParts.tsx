import type { ReactNode } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { Button, cn } from '../ui/Button';

// The reference's Settings building blocks: cards, section header, label, toggle, stat pill and sticky save bar.

// Shared with Team (Task 11) and Inspiration (Task 12): a small status pill and a bare icon button.
export const PILL = 'inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap';
export const ICON = 'grid place-items-center w-8 h-8 rounded-lg transition-colors';

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

export function SectionHeader({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-8 h-8 rounded-lg bg-orange-50 ring-1 ring-orange-100 flex items-center justify-center text-orange-600 flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
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
