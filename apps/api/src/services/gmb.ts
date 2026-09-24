import axios from 'axios';

const GMB_BASE = 'https://mybusiness.googleapis.com/v4';

export interface GmbPublishResult {
  post_id: string;
  url: string;
}

export async function publishToGmb(
  locationName: string,   // format: "accounts/{accountId}/locations/{locationId}"
  accessToken: string,
  imageUrl: string,
  summary: string,
  callToAction?: { actionType: 'CALL' | 'LEARN_MORE' | 'ORDER'; url?: string; phone?: string },
): Promise<GmbPublishResult> {
  const body: Record<string, unknown> = {
    languageCode: 'en',
    summary,
    media: [{ mediaFormat: 'PHOTO', sourceUrl: imageUrl }],
  };

  if (callToAction) {
    body['callToAction'] = callToAction.actionType === 'CALL'
      ? { actionType: 'CALL', url: `tel:${callToAction.phone ?? ''}` }
      : { actionType: callToAction.actionType, url: callToAction.url ?? '' };
  }

  const res = await axios.post<{ name: string }>(
    `${GMB_BASE}/${locationName}/localPosts`,
    body,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  return {
    post_id: res.data.name,
    url: `https://business.google.com/`,
  };
}

export async function fetchGmbPostMetrics(
  postName: string,  // full resource name from GMB
  accessToken: string,
): Promise<{ views: number; clicks: number; direction_requests: number }> {
  const res = await axios.get<{
    localPostMetrics: Array<{ metricValue: Array<{ metric: string; totalValue: { value: string } }> }>;
  }>(
    `${GMB_BASE}/${postName}/insights`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  let views = 0, clicks = 0, direction_requests = 0;
  for (const m of res.data.localPostMetrics?.[0]?.metricValue ?? []) {
    const val = parseInt(m.totalValue?.value ?? '0');
    if (m.metric === 'LOCAL_POST_VIEWS_SEARCH') views = val;
    if (m.metric === 'LOCAL_POST_ACTIONS_CALL_TO_ACTION') clicks = val;
    if (m.metric === 'QUERIES_DIRECT') direction_requests = val;
  }
  return { views, clicks, direction_requests };
}

export interface GmbReview {
  name: string; // accounts/{a}/locations/{l}/reviews/{r}
  reviewer?: { displayName?: string };
  starRating?: string; // ONE … FIVE, or STAR_RATING_UNSPECIFIED
  comment?: string;
  createTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
}

export async function fetchGmbReviews(
  locationName: string,
  accessToken: string,
  pageToken?: string,
): Promise<{ reviews: GmbReview[]; nextPageToken?: string }> {
  const res = await axios.get<{ reviews?: GmbReview[]; nextPageToken?: string }>(
    `${GMB_BASE}/${locationName}/reviews`,
    {
      params: pageToken ? { pageToken } : {},
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const reviews = res.data.reviews ?? [];
  return res.data.nextPageToken ? { reviews, nextPageToken: res.data.nextPageToken } : { reviews };
}

export async function replyToGmbReview(
  reviewName: string,   // "accounts/.../locations/.../reviews/..."
  accessToken: string,
  replyText: string,
): Promise<void> {
  await axios.put(
    `${GMB_BASE}/${reviewName}/reply`,
    { comment: replyText },
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
}
