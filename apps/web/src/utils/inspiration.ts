import type { InspirationHandle } from './settings.js';

export type InspirationPlatform = 'facebook' | 'instagram';

export const INSPIRATION_PLATFORMS: Array<{ value: InspirationPlatform; label: string }> = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
];

export function postsLearned(handle: Pick<InspirationHandle, 'posts_cache'>): number {
  return Array.isArray(handle.posts_cache) ? handle.posts_cache.length : 0;
}

export interface InspirationStats { references: number; facebook: number; instagram: number; postsLearned: number }

export function inspirationStats(handles: ReadonlyArray<Pick<InspirationHandle, 'platform' | 'posts_cache'>>): InspirationStats {
  return {
    references: handles.length,
    facebook: handles.filter((h) => h.platform === 'facebook').length,
    instagram: handles.filter((h) => h.platform === 'instagram').length,
    postsLearned: handles.reduce((sum, h) => sum + postsLearned(h), 0),
  };
}

export function referencePlaceholder(platform: InspirationPlatform): string {
  return platform === 'instagram' ? 'https://www.instagram.com/yourreference' : 'https://www.facebook.com/yourreference';
}

export function handleTitle(handle: Pick<InspirationHandle, 'handle_name' | 'handle_url'>): string {
  return handle.handle_name?.trim() || handle.handle_url;
}

/** Only http(s) links are references: the API refuses anything else, and the list links to them. */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
