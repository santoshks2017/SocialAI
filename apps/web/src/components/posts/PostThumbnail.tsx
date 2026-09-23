import { useState } from 'react';
import { Film, Megaphone, Play } from 'lucide-react';
import { cn } from '../ui/Button';

// Creative thumbnail over a branded placeholder; the placeholder stays if the image fails.
export function PostThumbnail({ url, isVideo = false }: { url: string | null; isVideo?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const Placeholder = isVideo ? Film : Megaphone;
  return (
    <div className="relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-orange-50 to-amber-50 ring-1 ring-orange-100 flex items-center justify-center">
      <Placeholder className="w-6 h-6 text-orange-500" />
      {url && !failed && (
        <img
          src={url}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn('absolute inset-0 w-full h-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}
      {isVideo && (
        <span className="absolute bottom-1 right-1 grid place-items-center w-4 h-4 rounded-full bg-black/60 text-white" aria-label="Video">
          <Play className="w-2.5 h-2.5 fill-current" />
        </span>
      )}
    </div>
  );
}
