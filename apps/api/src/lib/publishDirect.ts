import axios from 'axios';
import type { Prisma, Post, PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { publishToFacebook, publishToInstagram, publishReelToInstagram, publishVideoToFacebook } from '../services/meta.js';
import { publishToGmb } from '../services/gmb.js';
import { getFreshGoogleAccessToken } from './googleToken.js';
import { notifyPublishOutcome } from './postNotifications.js';
import { transitionPost } from './publishClaim.js';

export interface PublishDirectData {
  post_id: string;
  dealer_id: string;
  platform: 'facebook' | 'instagram' | 'gmb';
  image_url: string;
  caption: string;
  access_token: string;
  page_id?: string;
  ig_user_id?: string;
  gmb_location_name?: string;
  dealer_phone?: string;
  dealer_whatsapp?: string;
  media_type: 'image' | 'video';
  video_url: string;
}

export interface PlatformPublishResult {
  platform: string;
  success: boolean;
  post_id?: string;
  url?: string;
  error?: string;
}

export interface PostPublishOutcome {
  status: 'published' | 'failed';
  results: PlatformPublishResult[];
}

export type PublishablePost = Pick<Post, 'id' | 'dealer_id' | 'caption_text' | 'creative_urls'> & Partial<Pick<Post, 'media_type' | 'video_url'>>;

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  gmb: 'Google Business Profile',
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

function toJsonObject(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Prisma.InputJsonObject;
}

export function isSuccessfulResult(entry: unknown): boolean {
  return !!entry && typeof entry === 'object' && !Array.isArray(entry)
    && typeof (entry as { post_id?: unknown }).post_id === 'string'
    && !(entry as { error?: unknown }).error;
}

// Graph API and Google APIs both return { error: { message } }; prefer that over axios' generic text.
export function describePublishError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const apiMessage = (err.response?.data as { error?: { message?: unknown } } | undefined)?.error?.message;
    if (typeof apiMessage === 'string' && apiMessage) return apiMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

// Returns a token that is safe to publish with: Google tokens are renewed, expired Meta tokens refused.
export async function resolveAccessToken(conn: PlatformConnection): Promise<string> {
  if (conn.platform === 'gmb') return getFreshGoogleAccessToken(conn);
  if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() <= Date.now()) {
    const label = platformLabel(conn.platform);
    throw new Error(`${label} access expired. Reconnect ${label} in Settings, then publish again.`);
  }
  return conn.access_token;
}

export function buildPublishData(
  post: PublishablePost,
  platform: string,
  conn: PlatformConnection,
  accessToken = conn.access_token,
): PublishDirectData {
  return {
    post_id: post.id,
    dealer_id: post.dealer_id,
    platform: platform as PublishDirectData['platform'],
    image_url: (post.creative_urls as Record<string, string> | null)?.[platform] ?? '',
    caption: post.caption_text ?? '',
    access_token: accessToken,
    ...(platform === 'facebook' ? { page_id: conn.platform_account_id } : {}),
    ...(platform === 'instagram' ? { ig_user_id: conn.platform_account_id } : {}),
    ...(platform === 'gmb' ? { gmb_location_name: conn.platform_account_id } : {}),
    media_type: post.media_type === 'video' ? 'video' : 'image',
    video_url: post.video_url ?? '',
  };
}

async function sendVideoToPlatform(data: PublishDirectData): Promise<{ platform_post_id: string; url: string }> {
  const { platform, video_url, caption, access_token } = data;
  if (!video_url) throw new Error('This post has no video to publish.');
  if (platform === 'facebook') {
    if (!data.page_id) throw new Error('page_id required for Facebook publish');
    const result = await publishVideoToFacebook(data.page_id, access_token, video_url, caption);
    return { platform_post_id: result.post_id, url: result.url };
  }
  if (platform === 'instagram') {
    if (!data.ig_user_id) throw new Error('ig_user_id required for Instagram publish');
    const result = await publishReelToInstagram(data.ig_user_id, access_token, video_url, caption);
    return { platform_post_id: result.post_id, url: result.url };
  }
  if (platform === 'gmb') throw new Error("Google Business Profile doesn't support video posts. Remove it from this post's platforms.");
  throw new Error(`${platformLabel(platform)} video publishing isn't available yet.`);
}

// Calls the platform API only; no database writes.
async function sendToPlatform(data: PublishDirectData): Promise<{ platform_post_id: string; url: string }> {
  if (data.media_type === 'video') return sendVideoToPlatform(data);
  const { platform, image_url, caption, access_token } = data;
  if (platform === 'facebook') {
    if (!data.page_id) throw new Error('page_id required for Facebook publish');
    const result = await publishToFacebook(data.page_id, access_token, image_url, caption);
    return { platform_post_id: result.post_id, url: result.url };
  }
  if (platform === 'instagram') {
    if (!data.ig_user_id) throw new Error('ig_user_id required for Instagram publish');
    const result = await publishToInstagram(data.ig_user_id, access_token, image_url, caption);
    return { platform_post_id: result.post_id, url: result.url };
  }
  if (platform === 'gmb') {
    if (!data.gmb_location_name) throw new Error('gmb_location_name required for GMB publish');
    const result = await publishToGmb(
      data.gmb_location_name,
      access_token,
      image_url,
      caption.slice(0, 1500),
      data.dealer_phone ? { actionType: 'CALL', phone: data.dealer_phone } : undefined,
    );
    return { platform_post_id: result.post_id, url: result.url };
  }
  throw new Error(`Unknown platform: ${platform}`);
}

function resultEntry(result: PlatformPublishResult, at: string): Prisma.InputJsonObject {
  return result.success
    ? { post_id: result.post_id ?? '', url: result.url ?? '', published_at: at }
    : { error: result.error ?? 'Unknown error', failed_at: at };
}

// Publishes a post to every requested platform, then writes the outcome once:
// 'published' if at least one platform succeeded, 'failed' only if all of them failed.
// The caller is expected to have claimed the post (status 'publishing') first.
export async function publishPost(
  post: PublishablePost,
  platforms: string[],
): Promise<PostPublishOutcome> {
  const connections = await prisma.platformConnection.findMany({
    where: { dealer_id: post.dealer_id, is_connected: true },
  });
  const connMap = new Map(connections.map((c) => [c.platform, c]));
  const existing = await prisma.post.findUnique({ where: { id: post.id } });
  const previousResults = toJsonObject(existing?.publish_results);

  const results = await Promise.all(
    platforms.map(async (platform): Promise<PlatformPublishResult> => {
      // Never send twice to a platform that already has the post (retries, recovered posts)
      const previous = previousResults[platform];
      if (isSuccessfulResult(previous)) {
        const { post_id, url } = previous as { post_id: string; url?: string };
        return { platform, success: true, post_id, ...(url ? { url } : {}) };
      }
      const conn = connMap.get(platform);
      if (!conn) {
        return {
          platform,
          success: false,
          error: `No connected ${platformLabel(platform)} account. Connect it in Settings, then publish again.`,
        };
      }
      try {
        // Video compatibility doesn't depend on a fresh access token, so an unsupported platform
        // (e.g. Google Business Profile) fails fast here instead of behind a token refresh.
        const skipTokenResolution = post.media_type === 'video' && platform !== 'facebook' && platform !== 'instagram';
        const accessToken = skipTokenResolution ? '' : await resolveAccessToken(conn);
        const sent = await sendToPlatform(buildPublishData(post, platform, conn, accessToken));
        return { platform, success: true, post_id: sent.platform_post_id, url: sent.url };
      } catch (err) {
        return { platform, success: false, error: describePublishError(err) };
      }
    }),
  );

  const status = results.some((r) => r.success) ? 'published' : 'failed';
  const now = new Date();
  const publishResults: Record<string, unknown> = { ...previousResults };
  for (const result of results) {
    if (!isSuccessfulResult(previousResults[result.platform])) {
      publishResults[result.platform] = resultEntry(result, now.toISOString());
    }
  }

  await prisma.post.update({
    where: { id: post.id },
    data: {
      status,
      publish_results: publishResults as Prisma.InputJsonObject,
      ...(status === 'published' ? { published_at: now } : {}),
    },
  });

  await notifyPublishOutcome({
    post: {
      id: post.id,
      dealer_id: post.dealer_id,
      prompt_text: existing?.prompt_text ?? '',
      created_by: existing?.created_by ?? null,
    },
    status,
    publishedOn: results.filter((r) => r.success).map((r) => platformLabel(r.platform)),
    failedOn: results.filter((r) => !r.success).map((r) => platformLabel(r.platform)),
  });

  return { status, results };
}

// Queue worker path: one platform per call. Records that platform's result and derives the
// post status from all recorded results so one platform's failure can't mask another's success.
export async function publishPostToPlatform(
  data: PublishDirectData,
): Promise<{ platform_post_id: string; url: string }> {
  const { post_id, platform } = data;

  let sent: { platform_post_id: string; url: string } | null = null;
  let failure: unknown = null;
  try {
    // Keeps the cron sweep from also claiming a queued scheduled post.
    await transitionPost(post_id, (p) => p.status === 'scheduled', { status: 'publishing' });
    const conn = await prisma.platformConnection.findFirst({
      where: { dealer_id: data.dealer_id, platform, is_connected: true },
    });
    // Same fast-fail as publishPost: an unsupported video platform doesn't need a token.
    const skipTokenResolution = data.media_type === 'video' && platform !== 'facebook' && platform !== 'instagram';
    const accessToken = skipTokenResolution ? '' : conn ? await resolveAccessToken(conn) : data.access_token;
    sent = await sendToPlatform({ ...data, access_token: accessToken });
  } catch (err) {
    failure = err;
  }

  const result: PlatformPublishResult = sent
    ? { platform, success: true, post_id: sent.platform_post_id, url: sent.url }
    : { platform, success: false, error: describePublishError(failure) };
  const now = new Date();
  const existing = await prisma.post.findUnique({ where: { id: post_id } });
  const publishResults: Record<string, unknown> = {
    ...toJsonObject(existing?.publish_results),
    [platform]: resultEntry(result, now.toISOString()),
  };
  const targets = existing?.platforms?.length ? existing.platforms : [platform];
  const anySucceeded = targets.some((p) => isSuccessfulResult(publishResults[p]));

  await prisma.post.update({
    where: { id: post_id },
    data: {
      status: anySucceeded ? 'published' : 'failed',
      publish_results: publishResults as Prisma.InputJsonObject,
      ...(sent ? { published_at: now } : {}),
    },
  });

  if (!sent) throw failure;
  return sent;
}
