import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { cn } from '../ui/Button';

// Creative thumbnail over a branded placeholder; the placeholder stays if the image fails.
export function PostThumbnail({ url }: { url: string | null }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-orange-50 to-amber-50 ring-1 ring-orange-100 flex items-center justify-center">
      <Megaphone className="w-6 h-6 text-orange-500" />
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
    </div>
  );
}
