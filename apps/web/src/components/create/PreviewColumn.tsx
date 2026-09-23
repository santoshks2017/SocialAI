import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { IMAGE_PLATFORMS, platformLabel, type CreateType } from '../../utils/createStudio';
import { FacebookPostPreview } from './previews/FacebookPostPreview';
import { InstagramPostPreview } from './previews/InstagramPostPreview';
import { GooglePostPreview } from './previews/GooglePostPreview';
import { ReelPreview } from './previews/ReelPreview';
import type { PostPreviewProps } from './previews/PreviewParts';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];

interface PreviewColumnProps {
  type: CreateType;
  selected: string[];
  previewPlatform: string;
  onPreviewPlatform: (platform: string) => void;
  dealerName: string;
  initials: string;
  logoUrl: string | null;
  caption: string;
  imageUrl: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
  format: string;
  generating: boolean;
}

function PlatformTabs({ platforms, current, onPick }: { platforms: string[]; current: string; onPick: (platform: string) => void }) {
  return (
    <div className="ml-auto flex items-center gap-1">
      {platforms.map((p) => (
        <button
          key={p}
          type="button"
          title={platformLabel(p)}
          aria-label={`Preview on ${platformLabel(p)}`}
          aria-pressed={current === p}
          onClick={() => onPick(p)}
          className={cn('grid place-items-center w-7 h-7 rounded-lg', current === p ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-500 border border-zinc-200')}
        >
          <PlatformIcon platform={p as IconPlatform} size="sm" />
        </button>
      ))}
    </div>
  );
}

export function PreviewColumn(props: PreviewColumnProps) {
  const { type, selected, previewPlatform, onPreviewPlatform, format, generating } = props;
  const imagePlatforms = selected.filter((p) => IMAGE_PLATFORMS.some((ip) => ip.id === p));
  const imageCurrent = imagePlatforms.includes(previewPlatform) ? previewPlatform : imagePlatforms[0] ?? 'facebook';
  const reelCurrent = selected.includes(previewPlatform) ? previewPlatform : selected[0] ?? 'youtube';
  const postProps: PostPreviewProps = {
    dealerName: props.dealerName,
    initials: props.initials,
    logoUrl: props.logoUrl,
    caption: props.caption,
    imageUrl: props.imageUrl,
    isGenerating: generating,
  };

  return (
    <div className="hidden lg:flex flex-col border-l border-zinc-200/70 bg-zinc-50/50 min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200/70">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Preview</p>
        {type === 'image' && imagePlatforms.length > 1 && <PlatformTabs platforms={imagePlatforms} current={imageCurrent} onPick={onPreviewPlatform} />}
        {type === 'image' && imagePlatforms.length === 1 && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white border border-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700">
            <PlatformIcon platform={imagePlatforms[0] as IconPlatform} size="sm" /> {platformLabel(imagePlatforms[0]!)}
          </span>
        )}
        {type === 'reel' && selected.length > 0 && <PlatformTabs platforms={selected} current={reelCurrent} onPick={onPreviewPlatform} />}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden p-5 flex justify-center items-start">
        {type === 'reel' ? (
          <ReelPreview
            platform={reelCurrent}
            dealerName={props.dealerName}
            initials={props.initials}
            logoUrl={props.logoUrl}
            caption={props.caption}
            videoUrl={props.videoUrl}
            posterUrl={props.posterUrl}
            aspect={format}
            isGenerating={generating}
          />
        ) : (
          <div className="w-full max-w-[320px] max-h-full flex flex-col rounded-2xl border border-zinc-200 shadow-sm overflow-hidden bg-white">
            {imageCurrent === 'instagram' ? (
              <InstagramPostPreview {...postProps} />
            ) : imageCurrent === 'gmb' ? (
              <GooglePostPreview {...postProps} />
            ) : (
              <FacebookPostPreview {...postProps} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
