import React from 'react';
import { cn } from './Button';

export interface PlatformIconProps {
  platform: 'facebook' | 'instagram' | 'gmb' | 'whatsapp' | 'twitter' | 'youtube';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showLabel?: boolean;
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
};

const labelSizeClasses = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-base',
};

export function PlatformIcon({
  platform,
  size = 'md',
  className,
  showLabel = false,
}: PlatformIconProps) {
  const icons: Record<string, React.ReactNode> = {
    facebook: (
      <svg viewBox="0 0 24 24" fill="#1877F2" className={cn(sizeClasses[size], className)}>
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
    instagram: (
      <svg viewBox="0 0 24 24" className={cn(sizeClasses[size], className)}>
        <defs>
          <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f09433" />
            <stop offset="25%" stopColor="#e6683c" />
            <stop offset="50%" stopColor="#dc2743" />
            <stop offset="75%" stopColor="#cc2366" />
            <stop offset="100%" stopColor="#bc1888" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="url(#ig-gradient)" strokeWidth="2" />
        <circle cx="12" cy="12" r="4" fill="none" stroke="url(#ig-gradient)" strokeWidth="2" />
        <circle cx="17.5" cy="6.5" r="1.5" fill="url(#ig-gradient)" />
      </svg>
    ),
    gmb: (
      <svg viewBox="0 0 24 24" fill="#4285F4" className={cn(sizeClasses[size], className)}>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
      </svg>
    ),
    whatsapp: (
      <svg viewBox="0 0 24 24" fill="#25D366" className={cn(sizeClasses[size], className)}>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
    twitter: (
      <svg viewBox="0 0 24 24" fill="#000000" className={cn(sizeClasses[size], className)}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    youtube: (
      <svg viewBox="0 0 24 24" fill="#FF0000" className={cn(sizeClasses[size], className)}>
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  };

  if (showLabel) {
    const labels: Record<string, string> = {
      facebook: 'Facebook',
      instagram: 'Instagram',
      gmb: 'Google',
      whatsapp: 'WhatsApp',
      twitter: 'X (Twitter)',
      youtube: 'YouTube',
    };

    return (
      <div className="inline-flex items-center gap-1.5">
        {icons[platform]}
        <span className={cn('font-medium text-gray-700', labelSizeClasses[size])}>
          {labels[platform]}
        </span>
      </div>
    );
  }

  return <>{icons[platform]}</>;
}

export function PlatformIconGroup({
  platforms,
  size = 'sm',
  className,
  max = 3,
}: {
  platforms: PlatformIconProps['platform'][];
  size?: PlatformIconProps['size'];
  className?: string;
  max?: number;
}) {
  const visiblePlatforms = platforms.slice(0, max);
  const remaining = platforms.length - max;

  return (
    <div className={cn('flex items-center -space-x-1', className)}>
      {visiblePlatforms.map((platform) => (
        <div
          key={platform}
          className="bg-white rounded-full p-0.5 ring-2 ring-white"
        >
          <PlatformIcon platform={platform} size={size} />
        </div>
      ))}
      {remaining > 0 && (
        <div className="bg-gray-100 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ring-2 ring-white">
          +{remaining}
        </div>
      )}
    </div>
  );
}
