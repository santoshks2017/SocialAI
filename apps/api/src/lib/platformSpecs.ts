export interface FormatSpec {
  supported: boolean;
  aspectRatio: string;
  size: string;
  maxDurationSec: number | null;
  maxFileMb: number | null;
  captionMaxChars: number | null;
  hashtagsMax: number | null;
  captionNote: string;
  hashtagsRecommended: string;
}

export type SpecFormat = 'post' | 'story' | 'reel';
export type PlatformSpecs = Record<'facebook' | 'instagram' | 'youtube' | 'gmb' | 'common', Partial<Record<SpecFormat, FormatSpec>>>;

const unsupported: FormatSpec = {
  supported: false, aspectRatio: '', size: '', maxDurationSec: null, maxFileMb: null,
  captionMaxChars: null, hashtagsMax: null, captionNote: '', hashtagsRecommended: '',
};

// Code defaults; the admin console (Piece 4) will make these editable.
export const DEFAULT_PLATFORM_SPECS: PlatformSpecs = {
  facebook: {
    post: { supported: true, aspectRatio: '1:1, 4:5', size: '1080×1080', maxDurationSec: null, maxFileMb: 10, captionMaxChars: 63206, hashtagsMax: 30, captionNote: 'The first 125 characters show before "See more".', hashtagsRecommended: '1–3' },
    story: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 60, maxFileMb: 250, captionMaxChars: null, hashtagsMax: null, captionNote: 'Stories have no caption.', hashtagsRecommended: '' },
    reel: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 90, maxFileMb: 1024, captionMaxChars: 2200, hashtagsMax: 30, captionNote: 'Keep the hook in the first line.', hashtagsRecommended: '3–5' },
  },
  instagram: {
    post: { supported: true, aspectRatio: '1:1, 4:5', size: '1080×1080', maxDurationSec: null, maxFileMb: 8, captionMaxChars: 2200, hashtagsMax: 30, captionNote: 'The first 125 characters show in the feed.', hashtagsRecommended: '3–5' },
    story: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 60, maxFileMb: 100, captionMaxChars: null, hashtagsMax: null, captionNote: 'Stories have no caption.', hashtagsRecommended: '' },
    reel: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 90, maxFileMb: 100, captionMaxChars: 2200, hashtagsMax: 30, captionNote: 'Keep the hook in the first line.', hashtagsRecommended: '3–5' },
  },
  youtube: {
    post: unsupported,
    reel: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 180, maxFileMb: 256, captionMaxChars: 5000, hashtagsMax: 15, captionNote: 'The first line becomes the Shorts title.', hashtagsRecommended: '3' },
  },
  gmb: {
    post: { supported: true, aspectRatio: '1:1, 4:3', size: '1200×900', maxDurationSec: null, maxFileMb: 5, captionMaxChars: 1500, hashtagsMax: 10, captionNote: 'Google shows about the first 80 characters in search.', hashtagsRecommended: '0–2' },
    reel: unsupported,
  },
  common: {
    post: { supported: true, aspectRatio: '1:1', size: '1080×1080', maxDurationSec: null, maxFileMb: 8, captionMaxChars: 2200, hashtagsMax: 30, captionNote: '', hashtagsRecommended: '3–5' },
    reel: { supported: true, aspectRatio: '9:16', size: '1080×1920', maxDurationSec: 60, maxFileMb: 100, captionMaxChars: 2200, hashtagsMax: 30, captionNote: '', hashtagsRecommended: '3–5' },
  },
};
