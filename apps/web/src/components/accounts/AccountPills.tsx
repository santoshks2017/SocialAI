import { Briefcase, Link2 } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { STATUS_LABELS, type CatalogueStatus, type TokenHealth } from '../../utils/accounts';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];

const ICON_PLATFORMS: Record<string, IconPlatform> = {
  facebook: 'facebook', instagram: 'instagram', google: 'gmb', gmb: 'gmb', youtube: 'youtube', twitter: 'twitter',
};
const GLYPH_SIZE = { sm: 'w-4 h-4', md: 'w-5 h-5' } as const;
const PILL = 'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap';

export function PlatformGlyph({ platform, size = 'md' }: { platform: string; size?: 'sm' | 'md' }) {
  const icon = ICON_PLATFORMS[platform];
  if (icon) return <PlatformIcon platform={icon} size={size} />;
  const Glyph = platform === 'linkedin' ? Briefcase : Link2;
  return <Glyph className={GLYPH_SIZE[size]} />;
}

export function StatPill({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-lg bg-zinc-50 ring-1 ring-zinc-100 px-2.5 py-1">
      <span className="text-sm font-bold text-zinc-900">{value}</span>
      <span className="text-[11px] text-zinc-500">{label}</span>
    </span>
  );
}

const STATUS_STYLE: Record<CatalogueStatus, { pill: string; dot: string }> = {
  live: { pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100', dot: 'bg-emerald-500' },
  'via-facebook': { pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100', dot: 'bg-amber-500' },
  planned: { pill: 'bg-zinc-100 text-zinc-500', dot: 'bg-zinc-400' },
};

export function StatusPill({ status }: { status: CatalogueStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={cn(PILL, style.pill)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}

const TOKEN_STYLE = {
  expired: { pill: 'bg-red-50 text-red-600 ring-1 ring-red-100', dot: 'bg-red-500', label: 'Reconnect' },
  warn: { pill: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100', dot: 'bg-amber-400', label: 'Expiring' },
} as const;

export function TokenPill({ health }: { health: TokenHealth }) {
  if (health === 'ok') return null;
  const style = TOKEN_STYLE[health];
  return (
    <span className={cn(PILL, style.pill)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  );
}

export function ActivePill() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      {' Active'}
    </span>
  );
}
