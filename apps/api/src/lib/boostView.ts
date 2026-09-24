import type { BoostCampaign, Post } from '../generated/client/index.js';
import { postLabel } from './approvals.js';
import { firstCreativeUrl } from './inboxView.js';

// Boost records campaigns only: nothing here calls Meta Ads.
export const BOOST_MIN_DAILY_BUDGET = 200;
export const BOOST_MAX_DAILY_BUDGET = 1_000_000;
export const BOOST_MAX_DAYS = 90;

export type BoostPostSource = Pick<Post, 'id' | 'prompt_text' | 'thumbnail_url' | 'creative_urls'>;

export interface BoostPostSummary {
  id: string;
  title: string;
  thumbnail?: string;
}

export function boostPostSummary(post: BoostPostSource): BoostPostSummary {
  const thumbnail = post.thumbnail_url ?? firstCreativeUrl(post.creative_urls);
  return { id: post.id, title: postLabel(post), ...(thumbnail ? { thumbnail } : {}) };
}

export function mapCampaign(c: BoostCampaign, post?: BoostPostSummary) {
  return {
    id: c.id,
    dealerId: c.dealer_id,
    postId: c.post_id,
    ...(post ? { post } : {}),
    metaCampaignId: c.meta_campaign_id ?? undefined,
    dailyBudget: c.daily_budget,
    durationDays: c.duration_days,
    startDate: c.start_date?.toISOString() ?? undefined,
    endDate: c.end_date?.toISOString() ?? undefined,
    targeting: (c.targeting_spec as Record<string, unknown>) ?? {},
    status: c.status as 'draft' | 'active' | 'paused' | 'completed',
    totalSpent: c.total_spent,
    metrics: (c.metrics as Record<string, unknown>) ?? undefined,
    createdAt: c.created_at.toISOString(),
  };
}

/** People reached per day for a daily budget. The one estimate the web shows, on both wizard steps. */
export function reachEstimate(dailyBudget: number): { minReach: number; maxReach: number } {
  return { minReach: Math.round(dailyBudget * 12), maxReach: Math.round(dailyBudget * 20) };
}

export interface BoostCreate {
  postId: string;
  dailyBudget: number;
  durationDays: number;
  targeting: Record<string, unknown>;
}

export function parseBoostCreate(body: unknown): { ok: true; value: BoostCreate } | { ok: false; message: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'Send a JSON object' };
  const { postId, dailyBudget, durationDays, targeting } = body as Record<string, unknown>;
  if (typeof postId !== 'string' || !postId.trim()) return { ok: false, message: 'postId is required' };
  if (typeof dailyBudget !== 'number' || !Number.isInteger(dailyBudget) || dailyBudget < BOOST_MIN_DAILY_BUDGET || dailyBudget > BOOST_MAX_DAILY_BUDGET) {
    return { ok: false, message: `dailyBudget must be a whole number of rupees from ${BOOST_MIN_DAILY_BUDGET} to ${BOOST_MAX_DAILY_BUDGET}` };
  }
  if (typeof durationDays !== 'number' || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > BOOST_MAX_DAYS) {
    return { ok: false, message: `durationDays must be a whole number from 1 to ${BOOST_MAX_DAYS}` };
  }
  if (targeting !== undefined && (targeting === null || typeof targeting !== 'object' || Array.isArray(targeting))) {
    return { ok: false, message: 'targeting must be an object' };
  }
  return { ok: true, value: { postId: postId.trim(), dailyBudget, durationDays, targeting: (targeting as Record<string, unknown> | undefined) ?? {} } };
}
