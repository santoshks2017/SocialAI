import axios from 'axios';
import type { Prisma, Post, PlatformConnection } from '../generated/client/index.js';
import { prisma } from '../db/prisma.js';
import { publishToFacebook, publishToInstagram, publishReelToInstagram, publishVideoToFacebook } from '../services/meta.js';
import { publishToGmb } from '../services/gmb.js';
import { getFreshGoogleAccessToken } from './googleToken.js';
import { notifyPublishOutcome } from './postNotifications.js';
import { transitionPost } from './publishClaim.js';
import {
  byAge, noConnectedAccountMessage, platformLabel, primaryConnection, resolveTargets, selectedAccountGoneMessage,
} from './connections.js';
import {
  isLegacySuccess, isSuccessfulResult, mergePlatformResult, outcomeLabels, storedOutcome, toPlatformResult,
  type AccountOutcome, type PlatformPublishResult,
} from './publishResults.js';

export { platformLabel } from './connections.js';
export { isSuccessfulResult } from './publishResults.js';
export type { PlatformPublishResult } from './publishResults.js';

export type PublishPlatform = 'facebook' | 'instagram' | 'gmb' | 'youtube';

export interface PublishDirectData {
  post_id: string;
  dealer_id: string;
  platform: PublishPlatform;
  /** The PlatformConnection this publishes to (one account per job). */
  connection_id: string;
  image_url: string;
  /** What platforms receive: the caption, a blank line, then the hashtags. */
  caption: string;
  /** The caption text alone and the post's hashtags (YouTube builds its title and tags from them). */
  caption_text: string;
  hashtags: string[];
  access_token: string;
  page_id?: string;
  ig_user_id?: string;
  gmb_location_name?: string;
  dealer_phone?: string;
  dealer_whatsapp?: string;
  media_type: 'image' | 'video';
  video_url: string;
}

export interface PostPublishOutcome {
  status: 'published' | 'failed';
  results: PlatformPublishResult[];
}

export type PublishablePost = Pick<Post, 'id' | 'dealer_id' | 'caption_text' | 'creative_urls'>
  & Partial<Pick<Post, 'media_type' | 'video_url' | 'caption_hashtags' | 'connection_ids'>>;

export const YOUTUBE_VIDEO_ONLY = "YouTube takes video posts only. Remove it from this post's platforms.";
export const GMB_NO_VIDEO = "Google Business Profile doesn't support video posts. Remove it from this post's platforms.";

/** A platform that can't take this kind of post fails before any account is tried (and before a token refresh). */
export function unsupportedMediaError(platform: string, mediaType: string | null | undefined): string | null {
  const video = mediaType === 'video';
  if (platform === 'youtube' && !video) return YOUTUBE_VIDEO_ONLY;
  if (platform === 'gmb' && video) return GMB_NO_VIDEO;
  return null;
}

function toJsonObject(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Prisma.InputJsonObject;
}

// Graph API and Google APIs both return { error: { message } }; prefer that over axios' generic text.
export function describePublishError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const apiMessage = (err.response?.data as { error?: { message?: unknown } } | undefined)?.error?.message;
    if (typeof apiMessage === 'string' && apiMessage) return apiMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

// A token that is safe to publish with: Google tokens (Business Profile, YouTube) are renewed, expired Meta ones refused.
export async function resolveAccessToken(conn: PlatformConnection): Promise<string> {
  if (conn.platform === 'gmb' || conn.platform === 'youtube') return getFreshGoogleAccessToken(conn);
  if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() <= Date.now()) {
    const label = platformLabel(conn.platform);
    throw new Error(`${label} access expired. Reconnect ${label} in Settings, then publish again.`);
  }
  return conn.access_token;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A tag the caption already contains as a whole tag (not a prefix of a longer one), ignoring case.
function captionHasTag(caption: string, tag: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_#])${escapeRegExp(tag)}(?![\\p{L}\\p{M}\\p{N}_])`, 'iu').test(caption);
}

/**
 * The text platforms receive: the caption, a blank line, then the post's hashtags.
 * Tags already in the caption (older posts wrote them into it) aren't repeated.
 */
export function captionWithHashtags(caption: string, hashtags: readonly string[]): string {
  const tags: string[] = [];
  for (const raw of hashtags) {
    const name = raw.trim().replace(/^#+/, '');
    if (!name) continue;
    const tag = `#${name}`;
    if (captionHasTag(caption, tag) || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    tags.push(tag);
  }
  if (tags.length === 0) return caption;
  const body = caption.trimEnd();
  return body ? `${body}\n\n${tags.join(' ')}` : tags.join(' ');
}

// The fields that say which account a publish goes to.
function accountFields(platform: string, conn: PlatformConnection): Pick<PublishDirectData, 'connection_id' | 'page_id' | 'ig_user_id' | 'gmb_location_name'> {
  return {
    connection_id: conn.id,
    ...(platform === 'facebook' ? { page_id: conn.platform_account_id } : {}),
    ...(platform === 'instagram' ? { ig_user_id: conn.platform_account_id } : {}),
    ...(platform === 'gmb' ? { gmb_location_name: conn.platform_account_id } : {}),
  };
}

export function buildPublishData(
  post: PublishablePost,
  platform: string,
  conn: PlatformConnection,
  accessToken = conn.access_token,
): PublishDirectData {
  const captionText = post.caption_text ?? '';
  const hashtags = post.caption_hashtags ?? [];
  return {
    post_id: post.id,
    dealer_id: post.dealer_id,
    platform: platform as PublishPlatform,
    ...accountFields(platform, conn),
    image_url: (post.creative_urls as Record<string, string> | null)?.[platform] ?? '',
    // Every path to a platform (direct, cron and queued jobs) sends this caption.
    caption: captionWithHashtags(captionText, hashtags),
    caption_text: captionText,
    hashtags: [...hashtags],
    access_token: accessToken,
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
  if (platform === 'gmb') throw new Error(GMB_NO_VIDEO);
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
  if (platform === 'youtube') throw new Error(YOUTUBE_VIDEO_ONLY);
  throw new Error(`Unknown platform: ${platform}`);
}

function accountName(conn: PlatformConnection): string {
  return conn.platform_account_name ?? platformLabel(conn.platform);
}

// One account of one platform: skipped when it already has the post, otherwise sent with that account's token.
async function publishToAccount(post: PublishablePost, platform: string, conn: PlatformConnection, previous: unknown): Promise<AccountOutcome> {
  const stored = storedOutcome(previous, conn.id);
  if (stored) return stored;
  try {
    const accessToken = await resolveAccessToken(conn);
    const sent = await sendToPlatform(buildPublishData(post, platform, conn, accessToken));
    return { connection_id: conn.id, account_name: accountName(conn), success: true, post_id: sent.platform_post_id, url: sent.url };
  } catch (err) {
    return { connection_id: conn.id, account_name: accountName(conn), success: false, error: describePublishError(err) };
  }
}

// Publishes a post to every target account of every requested platform, then writes the outcome once:
// 'published' if at least one account succeeded, 'failed' only if all of them failed. An account that
// already has the post is never sent it again, so a retry resends only to the failed accounts.
// The caller is expected to have claimed the post (status 'publishing') first.
export async function publishPost(post: PublishablePost, platforms: string[]): Promise<PostPublishOutcome> {
  const [connections, existing] = await Promise.all([
    prisma.platformConnection.findMany({ where: { dealer_id: post.dealer_id } }),
    prisma.post.findUnique({ where: { id: post.id } }),
  ]);
  const previousResults = toJsonObject(existing?.publish_results);
  const plans = resolveTargets({ platforms, connection_ids: post.connection_ids ?? existing?.connection_ids ?? [] }, connections);
  const at = new Date().toISOString();

  const settled = await Promise.all(plans.map(async (plan) => {
    const previous: unknown = previousResults[plan.platform];
    // Published before per-account results existed: that platform is done, as before.
    if (isLegacySuccess(previous)) return { platform: plan.platform, summary: previous, outcomes: [] as AccountOutcome[] };
    const blocked = unsupportedMediaError(plan.platform, post.media_type) ?? plan.error;
    const outcomes = blocked ? [] : await Promise.all(plan.targets.map((conn) => publishToAccount(post, plan.platform, conn, previous)));
    const summary: unknown = mergePlatformResult(previous, outcomes, plan.targets.map((c) => c.id), at, blocked ?? undefined);
    return { platform: plan.platform, summary, outcomes };
  }));

  const results = settled.map((s) => toPlatformResult(s.platform, s.summary, s.outcomes));
  const status = results.some((r) => r.success) ? 'published' : 'failed';
  const publishResults: Record<string, unknown> = { ...previousResults };
  for (const s of settled) publishResults[s.platform] = s.summary;

  await prisma.post.update({
    where: { id: post.id },
    data: {
      status,
      publish_results: publishResults as Prisma.InputJsonObject,
      ...(status === 'published' ? { published_at: new Date(at) } : {}),
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
    ...outcomeLabels(results),
  });

  return { status, results };
}

// Queue worker path: one account per job. Records that account's result and derives the post status from all
// recorded results, so one account's failure can't mask another's success.
export async function publishPostToPlatform(data: PublishDirectData): Promise<{ platform_post_id: string; url: string }> {
  const { post_id, platform } = data;
  const connections = await prisma.platformConnection.findMany({ where: { dealer_id: data.dealer_id, platform } });
  // Jobs queued before per-account publishing carry no connection_id: they go to the primary account.
  const conn = data.connection_id
    ? connections.find((c) => c.id === data.connection_id && c.is_connected) ?? null
    : primaryConnection(connections, platform);

  const before = await prisma.post.findUnique({ where: { id: post_id } });
  const previous: unknown = toJsonObject(before?.publish_results)[platform];
  if (isLegacySuccess(previous)) {
    const entry = previous as { post_id: string; url?: unknown };
    return { platform_post_id: entry.post_id, url: typeof entry.url === 'string' ? entry.url : '' };
  }
  const done = conn ? storedOutcome(previous, conn.id) : null;
  if (done?.post_id) return { platform_post_id: done.post_id, url: done.url ?? '' };

  let sent: { platform_post_id: string; url: string } | null = null;
  let failure: unknown = null;
  try {
    // Keeps the cron sweep from also claiming a queued scheduled post.
    await transitionPost(post_id, (p) => p.status === 'scheduled', { status: 'publishing' });
    if (!conn) throw new Error(data.connection_id ? selectedAccountGoneMessage(platform) : noConnectedAccountMessage(platform));
    const blocked = unsupportedMediaError(platform, data.media_type);
    if (blocked) throw new Error(blocked);
    // The account fields come from the resolved connection, so an older job reaches the primary account's Page.
    sent = await sendToPlatform({ ...data, ...accountFields(platform, conn), access_token: await resolveAccessToken(conn) });
  } catch (err) {
    failure = err;
  }

  const at = new Date().toISOString();
  const existing = await prisma.post.findUnique({ where: { id: post_id } });
  const publishResults: Record<string, unknown> = { ...toJsonObject(existing?.publish_results) };
  const order = [...connections].sort(byAge).map((c) => c.id);
  if (conn) {
    const outcome: AccountOutcome = sent
      ? { connection_id: conn.id, account_name: accountName(conn), success: true, post_id: sent.platform_post_id, url: sent.url }
      : { connection_id: conn.id, account_name: accountName(conn), success: false, error: describePublishError(failure) };
    publishResults[platform] = mergePlatformResult(publishResults[platform], [outcome], order, at);
  } else {
    publishResults[platform] = mergePlatformResult(publishResults[platform], [], order, at, describePublishError(failure));
  }
  const targets = existing?.platforms?.length ? existing.platforms : [platform];
  const anySucceeded = targets.some((p) => isSuccessfulResult(publishResults[p]));

  await prisma.post.update({
    where: { id: post_id },
    data: {
      status: anySucceeded ? 'published' : 'failed',
      publish_results: publishResults as Prisma.InputJsonObject,
      ...(sent ? { published_at: new Date(at) } : {}),
    },
  });

  if (!sent) throw failure;
  return sent;
}
