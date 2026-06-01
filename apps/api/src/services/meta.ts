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

export async function publishToInstagram(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string,
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

  // Step 2 — publish the container
  const publishRes = await axios.post<{ id: string }>(
    `${META_GRAPH_BASE}/${igUserId}/media_publish`,
    { creation_id: creationId, access_token: accessToken },
  );

  return {
    post_id: publishRes.data.id,
    url: `https://www.instagram.com/p/${publishRes.data.id}/`,
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

// ─── Post metrics ─────────────────────────────────────────────────────────────

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

export async function fetchInstagramPostMetrics(
  mediaId: string,
  accessToken: string,
): Promise<{ reach: number; likes: number; comments: number; saved: number }> {
  const res = await axios.get<{
    reach: number;
    like_count: number;
    comments_count: number;
    saved: number;
  }>(
    `${META_GRAPH_BASE}/${mediaId}/insights`,
    {
      params: {
        metric: 'reach,like_count,comments_count,saved',
        access_token: accessToken,
      },
    },
  );
  return {
    reach: res.data.reach ?? 0,
    likes: res.data.like_count ?? 0,
    comments: res.data.comments_count ?? 0,
    saved: res.data.saved ?? 0,
  };
}
