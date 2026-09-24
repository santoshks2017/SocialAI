import axios from 'axios';
import type { ConnectionInput } from './connectionStore.js';
import { isMockId } from './platformMock.js';

const META_GRAPH_BASE = 'https://graph.facebook.com/v19.0';
const TIMEOUT_MS = 15_000;

export interface InstagramAccount {
  id: string;
  username: string;
  name: string | null;
}

// Local and demo connects: the first mock Page (routes/platform.ts) has this linked Instagram account.
export const MOCK_INSTAGRAM: InstagramAccount = { id: 'mock_ig_user_id', username: 'mock_dealership_instagram', name: 'Mock Dealership' };
const MOCK_PAGE_WITH_INSTAGRAM = 'mock_fb_page_id';

/** The Instagram Business account linked to a Facebook Page, or null when none is linked. */
export async function discoverInstagram(pageId: string, pageToken: string): Promise<InstagramAccount | null> {
  if (isMockId(pageId) || isMockId(pageToken)) return pageId === MOCK_PAGE_WITH_INSTAGRAM ? MOCK_INSTAGRAM : null;
  const res = await axios.get<{ instagram_business_account?: { id?: string; username?: string; name?: string } }>(
    `${META_GRAPH_BASE}/${pageId}`,
    { params: { fields: 'instagram_business_account{id,username,name}', access_token: pageToken }, timeout: TIMEOUT_MS },
  );
  const ig = res.data.instagram_business_account;
  if (!ig?.id) return null;
  return { id: ig.id, username: ig.username || ig.id, name: ig.name ?? null };
}

/** The connection row for a discovered account: it posts with its Page's token, so it shares that expiry. */
export function instagramConnection(ig: InstagramAccount, pageToken: string, expiresAt: Date | null): ConnectionInput {
  return {
    platform: 'instagram',
    platform_account_id: ig.id,
    platform_account_name: `@${ig.username}`,
    access_token: pageToken,
    token_expires_at: expiresAt,
  };
}
