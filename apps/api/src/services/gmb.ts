import axios from 'axios';

const GMB_BASE = 'https://mybusiness.googleapis.com/v4';
// Cron-path reads (metrics, reviews): a hung connection must not outlast the cron's time-box.
const READ_TIMEOUT_MS = 15_000;

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

export interface GmbLocation {
  /** `accounts/{accountId}/locations/{locationId}`: the name publishing, reviews and metrics use. */
  name: string;
  title: string;
}

const GBP_MAX_PAGES = 20; // result pages read per list, a guard against endless paging

export interface GmbLocationsResult {
  items: GmbLocation[];
  /** True when the account has more than `max` locations, so the caller knows the list was cut. */
  truncated: boolean;
}

/**
 * Every location across the user's Business Profile accounts (v4 API, following nextPageToken), up to `max`.
 * Reads one location past `max` (instead of paging through everything) so `truncated` can be reported without
 * an unbounded fetch.
 */
export async function fetchGmbLocations(accessToken: string, max: number): Promise<GmbLocationsResult> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const locations: GmbLocation[] = [];
  let accountsToken: string | undefined;
  accounts: for (let accountPage = 0; accountPage < GBP_MAX_PAGES; accountPage++) {
    const accountsRes = await axios.get<{ accounts?: Array<{ name?: string; accountName?: string }>; nextPageToken?: string }>(
      `${GMB_BASE}/accounts`,
      { headers, params: accountsToken ? { pageToken: accountsToken } : {}, timeout: READ_TIMEOUT_MS },
    );
    for (const account of accountsRes.data.accounts ?? []) {
      if (!account.name) continue;
      let locationsToken: string | undefined;
      for (let locationPage = 0; locationPage < GBP_MAX_PAGES; locationPage++) {
        const locationsRes = await axios.get<{ locations?: Array<{ name?: string; locationName?: string }>; nextPageToken?: string }>(
          `${GMB_BASE}/${account.name}/locations`,
          { headers, params: { pageSize: 100, ...(locationsToken ? { pageToken: locationsToken } : {}) }, timeout: READ_TIMEOUT_MS },
        );
        for (const location of locationsRes.data.locations ?? []) {
          if (!location.name) continue;
          locations.push({ name: location.name, title: location.locationName || account.accountName || location.name });
          if (locations.length > max) break accounts;
        }
        locationsToken = locationsRes.data.nextPageToken;
        if (!locationsToken) break;
      }
    }
    accountsToken = accountsRes.data.nextPageToken;
    if (!accountsToken) break;
  }
  return { items: locations.slice(0, max), truncated: locations.length > max };
}

export async function fetchGmbPostMetrics(
  postName: string,  // full resource name from GMB
  accessToken: string,
): Promise<{ views: number; clicks: number; direction_requests: number }> {
  const res = await axios.get<{
    localPostMetrics: Array<{ metricValue: Array<{ metric: string; totalValue: { value: string } }> }>;
  }>(
    `${GMB_BASE}/${postName}/insights`,
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: READ_TIMEOUT_MS },
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
      timeout: READ_TIMEOUT_MS,
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
