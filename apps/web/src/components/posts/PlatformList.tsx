import { PlatformIcon } from '../ui/PlatformIcon';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];
const WITH_ICON = new Set<string>(['facebook', 'instagram', 'gmb', 'whatsapp', 'youtube']);

export function PlatformList({ platforms }: { platforms?: string[] | null }) {
  if (!platforms?.length) return <span className="text-xs text-zinc-300">No platforms</span>;
  return (
    <div className="flex items-center gap-1.5">
      {platforms.map((p) => WITH_ICON.has(p)
        ? <PlatformIcon key={p} platform={p as IconPlatform} size="sm" />
        : <span key={p} className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{p}</span>)}
    </div>
  );
}
