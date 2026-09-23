import { ImagePlus, Sparkles } from 'lucide-react';

export interface PostPreviewProps {
  dealerName: string;
  initials: string;
  logoUrl: string | null;
  caption: string;
  imageUrl: string | null;
  isGenerating: boolean;
}

export function Avatar({ logoUrl, initials, size, text }: { logoUrl: string | null; initials: string; size: string; text: string }) {
  if (logoUrl) return <img src={logoUrl} alt="" className={`${size} rounded-full object-cover bg-white border border-zinc-200 shrink-0`} />;
  return (
    <div className={`${size} bg-orange-600 rounded-full flex items-center justify-center shrink-0`}>
      <span className={`${text} font-black text-white`}>{initials}</span>
    </div>
  );
}

export function MediaSlot({ imageUrl, isGenerating, square = true }: { imageUrl: string | null; isGenerating: boolean; square?: boolean }) {
  const shape = square ? 'w-full aspect-square' : 'w-full aspect-[4/3]';
  if (imageUrl) return <img src={imageUrl} alt="Creative" className={`${shape} object-cover`} />;
  if (isGenerating) {
    return (
      <div className={`${shape} bg-gradient-to-br from-zinc-900 to-zinc-800 flex items-center justify-center`}>
        <Sparkles className="w-8 h-8 text-white/60 animate-pulse" />
      </div>
    );
  }
  return (
    <div className={`${shape} bg-zinc-100 flex items-center justify-center`}>
      <ImagePlus className="w-7 h-7 text-zinc-300" />
    </div>
  );
}
