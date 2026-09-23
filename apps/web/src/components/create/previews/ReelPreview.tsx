import { Film, LoaderCircle } from 'lucide-react';
import { cn } from '../../ui/Button';
import { PlatformIcon } from '../../ui/PlatformIcon';
import { reelHandle, truncateText } from '../../../utils/createStudio';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];
const SURFACE: Record<string, string> = { youtube: 'Shorts', instagram: 'Reels', facebook: 'Reels' };

interface ReelPreviewProps {
  platform: string;
  dealerName: string;
  initials: string;
  logoUrl: string | null;
  caption: string;
  videoUrl: string | null;
  posterUrl: string | null;
  aspect: string;
  isGenerating: boolean;
}

export function ReelPreview({ platform, dealerName, initials, logoUrl, caption, videoUrl, posterUrl, aspect, isGenerating }: ReelPreviewProps) {
  const frame = aspect === '16:9' ? 'aspect-video max-w-md' : aspect === '1:1' ? 'aspect-square max-w-[300px]' : 'aspect-[9/16] max-w-[260px]';
  return (
    <div className={cn('relative w-full rounded-2xl overflow-hidden bg-black shadow-lg border border-zinc-800', frame)}>
      {videoUrl ? (
        <video src={videoUrl} poster={posterUrl ?? undefined} controls playsInline className="absolute inset-0 w-full h-full object-contain bg-black" />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-zinc-800 to-black text-center px-6">
          {isGenerating ? (
            <div className="text-zinc-300">
              <LoaderCircle className="w-7 h-7 animate-spin mx-auto mb-2" />
              <p className="text-sm font-medium">Generating your reel…</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">AI video — 1–3 min</p>
            </div>
          ) : (
            <div className="text-zinc-500">
              <Film className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-400">Your reel appears here</p>
            </div>
          )}
        </div>
      )}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/50 to-transparent pointer-events-none">
        <span className="text-white text-[12px] font-bold flex items-center gap-1">
          <PlatformIcon platform={platform as IconPlatform} size="sm" /> {SURFACE[platform] ?? 'Reel'}
        </span>
      </div>
      <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3 text-white pointer-events-none" aria-hidden="true">
        {['♡', '💬', '↗', '⋯'].map((icon) => <span key={icon} className="text-[18px] drop-shadow">{icon}</span>)}
      </div>
      <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/70 to-transparent pointer-events-none">
        <div className="flex items-center gap-1.5 mb-1">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="w-5 h-5 rounded-full object-cover border border-white/40" />
          ) : (
            <span className="w-5 h-5 rounded-full bg-orange-600 grid place-items-center text-[8px] font-black text-white">{initials[0]}</span>
          )}
          <span className="text-white text-[11px] font-semibold">{reelHandle(dealerName)}</span>
        </div>
        {caption && <p className="text-white/90 text-[10px] leading-snug line-clamp-2">{truncateText(caption, 90)}</p>}
      </div>
    </div>
  );
}
