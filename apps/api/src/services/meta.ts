import axios from 'axios';

const META_GRAPH_BASE = 'https://graph.facebook.com/v19.0';

export interface MetaPublishResult {
  post_id: string;
  url: string;
}

// ─── Facebook ────────────────────────────────────────────────────────────────

export async function publishToFacebook(
  pageId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
): Promise<MetaPublishResult> {
  if (accessToken.startsWith('mock_') || pageId.startsWith('mock_')) {
    const mockId = `mock_fb_post_${Date.now()}`;
    return {
      post_id: mockId,
      url: `https://www.facebook.com/${pageId}/posts/${mockId}`,
    };
  }
  const response = await axios.post<{ id: string }>(
    `${META_GRAPH_BASE}/${pageId}/photos`,
    { url: imageUrl, message: caption, access_token: accessToken },
  );
  return {
    post_id: response.data.id,
    url: `https://www.facebook.com/${pageId}/posts/${response.data.id}`,
  };
}

// ─── Instagram (two-step) ─────────────────────────────────────────────────────

// Waits between container status checks; ~30s in total.
export const IG_CONTAINER_POLL_DELAYS_MS = [1000, 2000, 3000, 4000, 5000, 5000, 5000, 5000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Instagram processes the uploaded image asynchronously; media_publish fails until the
// container reaches FINISHED.
export async function waitForInstagramContainer(
  creationId: string,
  accessToken: string,
  pollDelaysMs: readonly number[] = IG_CONTAINER_POLL_DELAYS_MS,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const res = await axios.get<{ status_code?: string; status?: string }>(
      `${META_GRAPH_BASE}/${creationId}`,
      { params: { fields: 'status_code,status', access_token: accessToken } },
    );
    const statusCode = res.data.status_code;
    if (statusCode === 'FINISHED') return;
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      const detail = res.data.status ? `: ${res.data.status}` : '';
      throw new Error(`Instagram could not process the media (${statusCode}${detail})`);
    }
    const delay = pollDelaysMs[attempt];
    if (delay === undefined) {
      throw new Error(`Instagram media was still processing (${statusCode ?? 'unknown'}) after ${attempt + 1} checks; try again later`);
    }
    await sleep(delay);
  }
}

// Instagram links use a shortcode, not the media id the Graph API returns, so ask for the
// post's permalink. Publishing already succeeded, so a failure here keeps the fallback link.
async function instagramPermalink(mediaId: string, accessToken: string, fallback: string): Promise<string> {
  try {
    const res = await axios.get<{ permalink?: unknown }>(
      `${META_GRAPH_BASE}/${mediaId}`,
      { params: { fields: 'permalink', access_token: accessToken } },
    );
    const permalink = res.data?.permalink;
    return typeof permalink === 'string' && permalink.startsWith('https://') ? permalink : fallback;
  } catch (err) {
    // The message only: a raw axios error carries the request config, including the access token.
    console.warn('[meta] Could not fetch the Instagram permalink:', err instanceof Error ? err.message : String(err));
    return fallback;
  }
}

export async function publishToInstagram(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
  pollDelaysMs: readonly number[] = IG_CONTAINER_POLL_DELAYS_MS,
): Promise<MetaPublishResult> {
  if (accessToken.startsWith('mock_') || igUserId.startsWith('mock_')) {
    const mockId = `mock_ig_post_${Date.now()}`;
    return {
      post_id: mockId,
      url: `https://www.instagram.com/p/${mockId}/`,
    };
  }
  // Step 1 — create media container
  const containerRes = await axios.post<{ id: string }>(
    `${META_GRAPH_BASE}/${igUserId}/media`,
    { image_url: imageUrl, caption, access_token: accessToken },
  );
  const creationId = containerRes.data.id;

  await waitForInstagramContainer(creationId, accessToken, pollDelaysMs);

  // Step 2 — publish the container
  const publishRes = await axios.post<{ id: string }>(
    `${META_GRAPH_BASE}/${igUserId}/media_publish`,
    { creation_id: creationId, access_token: accessToken },
  );

  return {
    post_id: publishRes.data.id,
    url: await instagramPermalink(publishRes.data.id, accessToken, `https://www.instagram.com/p/${publishRes.data.id}/`),
  };
}

// ─── Video (reels) ─────────────────────────────────────────────────────────────

// Video containers take longer to process than images; ~3 minutes in total.
export const IG_VIDEO_POLL_DELAYS_MS = [5000, 5000, 5000, 5000, 5000, 5000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000];

export async function publishVideoToFacebook(
  pageId: string,
  accessToken: string,
  videoUrl: string,
  caption: string,
): Promise<MetaPublishResult> {
  if (accessToken.startsWith('mock_') || pageId.startsWith('mock_')) {
    const mockId = `mock_fb_video_${Date.now()}`;
    return { post_id: mockId, url: `https://www.facebook.com/${pageId}/videos/${mockId}` };
  }
  const response = await axios.post<{ id: string }>(
    `${META_GRAPH_BASE}/${pageId}/videos`,
    { file_url: videoUrl, description: caption, access_token: accessToken },
  );
  return { post_id: response.data.id, url: `https://www.facebook.com/${pageId}/videos/${response.data.id}` };
}

export async function publishReelToInstagram(
  igUserId: string,
  accessToken: string,
  videoUrl: string,
  caption: string,
  pollDelaysMs: readonly number[] = IG_VIDEO_POLL_DELAYS_MS,
): Promise<MetaPublishResult> {
  if (accessToken.startsWith('mock_') || igUserId.startsWith('mock_')) {
    const mockId = `mock_ig_reel_${Date.now()}`;
    return { post_id: mockId, url: `https://www.instagram.com/reel/${mockId}/` };
  }
  const containerRes = await axios.post<{ id: string }>(
    `${META_GRAPH_BASE}/${igUserId}/media`,
    { media_type: 'REELS', video_url: videoUrl, caption, share_to_feed: true, access_token: accessToken },
  );
  await waitForInstagramContainer(containerRes.data.id, accessToken, pollDelaysMs);
  const publishRes = await axios.post<{ id: string }>(
    `${META_GRAPH_BASE}/${igUserId}/media_publish`,
    { creation_id: containerRes.data.id, access_token: accessToken },
  );
  return {
    post_id: publishRes.data.id,
    url: await instagramPermalink(publishRes.data.id, accessToken, `https://www.instagram.com/reel/${publishRes.data.id}/`),
  };
}

// ─── Token management ─────────────────────────────────────────────────────────

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const appId = process.env['META_APP_ID'];
  const appSecret = process.env['META_APP_SECRET'];
  if (!appId || !appSecret) throw new Error('META_APP_ID and META_APP_SECRET must be set');

  const res = await axios.get<{ access_token: string; expires_in: number }>(
    `${META_GRAPH_BASE}/oauth/access_token`,
    {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortLivedToken,
      },
      timeout: 15_000,
    },
  );
  return res.data;
}

export async function getPageAccessToken(userAccessToken: string, pageId: string): Promise<string> {
  const res = await axios.get<{ access_token: string }>(
    `${META_GRAPH_BASE}/${pageId}`,
    { params: { fields: 'access_token', access_token: userAccessToken } },
  );
  return res.data.access_token;
}

export interface ManagedPage {
  id: string;
  name: string;
  access_token: string;
}

export interface ManagedPagesResult {
  items: ManagedPage[];
  /** True when the user manages more than `max` Pages, so the caller knows the list was cut. */
  truncated: boolean;
}

/**
 * Every Facebook Page the user manages, each with its Page token (me/accounts, following paging.next), up to
 * `max`. Reads one Page past `max` (instead of paging through the whole list) so `truncated` can be reported
 * without an unbounded fetch.
 */
export async function fetchManagedPages(userAccessToken: string, max: number): Promise<ManagedPagesResult> {
  const pages: ManagedPage[] = [];
  let url: string | undefined = `${META_GRAPH_BASE}/me/accounts`;
  let params: Record<string, string> | undefined = { fields: 'id,name,access_token', limit: '100', access_token: userAccessToken };
  for (let hop = 0; url && hop < 20 && pages.length <= max; hop++) {
    const res: { data: { data?: Array<Partial<ManagedPage>>; paging?: { next?: string } } } =
      await axios.get(url, { ...(params ? { params } : {}), timeout: 15_000 });
    for (const page of res.data.data ?? []) {
      if (page.id && page.name && page.access_token) pages.push({ id: page.id, name: page.name, access_token: page.access_token });
      if (pages.length > max) break;
    }
    // paging.next is a full URL that already carries the query, token included
    url = res.data.paging?.next;
    params = undefined;
  }
  return { items: pages.slice(0, max), truncated: pages.length > max };
}

// ─── Post metrics ─────────────────────────────────────────────────────────────

// Cron-path reads (post metrics, follower counts): a hung connection must not outlast the cron's time-box.
const METRICS_TIMEOUT_MS = 15_000;

export async function fetchFacebookPostMetrics(
  postId: string,
  accessToken: string,
): Promise<{ reach: number; likes: number; comments: number; shares: number }> {
  const res = await axios.get<{
    insights: { data: Array<{ name: string; values: Array<{ value: number }> }> };
    likes: { summary: { total_count: number } };
    shares: { count: number };
    comments: { summary: { total_count: number } };
  }>(
    `${META_GRAPH_BASE}/${postId}`,
    {
      params: {
        fields: 'insights.metric(post_reach),likes.summary(true),shares,comments.summary(true)',
        access_token: accessToken,
      },
      timeout: METRICS_TIMEOUT_MS,
    },
  );

  const reach = res.data.insights?.data?.[0]?.values?.[0]?.value ?? 0;
  return {
    reach,
    likes: res.data.likes?.summary?.total_count ?? 0,
    comments: res.data.comments?.summary?.total_count ?? 0,
    shares: res.data.shares?.count ?? 0,
  };
}

type InsightRow = { name?: string; values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } };

// /{id}/insights answers { data: [{ name, values: [{ value }] }] } (or total_value on newer metrics).
function insightValue(rows: InsightRow[] | undefined, name: string): number {
  const row = rows?.find((r) => r.name === name);
  const raw = row?.values?.[0]?.value ?? row?.total_value?.value;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

export async function fetchInstagramPostMetrics(
  mediaId: string,
  accessToken: string,
): Promise<{ reach: number; likes: number; comments: number; saved: number }> {
  const res = await axios.get<{ data?: InsightRow[] }>(
    `${META_GRAPH_BASE}/${mediaId}/insights`,
    { params: { metric: 'reach,likes,comments,saved', access_token: accessToken }, timeout: METRICS_TIMEOUT_MS },
  );
  const rows = res.data.data;
  return {
    reach: insightValue(rows, 'reach'),
    likes: insightValue(rows, 'likes'),
    comments: insightValue(rows, 'comments'),
    saved: insightValue(rows, 'saved'),
  };
}

// ─── Followers (daily audience snapshots) ─────────────────────────────────────
// Mock connections (local and demo) have no audience: null means "skip".

function followerCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export async function fetchPageFollowers(pageId: string, accessToken: string): Promise<number | null> {
  if (pageId.startsWith('mock_') || accessToken.startsWith('mock_')) return null;
  const res = await axios.get<{ followers_count?: number; fan_count?: number }>(
    `${META_GRAPH_BASE}/${pageId}`,
    { params: { fields: 'followers_count,fan_count', access_token: accessToken }, timeout: METRICS_TIMEOUT_MS },
  );
  return followerCount(res.data.followers_count ?? res.data.fan_count);
}

export async function fetchInstagramFollowers(igUserId: string, accessToken: string): Promise<number | null> {
  if (igUserId.startsWith('mock_') || accessToken.startsWith('mock_')) return null;
  const res = await axios.get<{ followers_count?: number }>(
    `${META_GRAPH_BASE}/${igUserId}`,
    { params: { fields: 'followers_count', access_token: accessToken }, timeout: METRICS_TIMEOUT_MS },
  );
  return followerCount(res.data.followers_count);
}
