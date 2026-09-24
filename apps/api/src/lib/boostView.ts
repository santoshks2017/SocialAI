import type { BoostCampaign, Post } from '../generated/client/index.js';
import { postLabel } from './approvals.js';
import { firstCreativeUrl } from './inboxView.js';

// Boost records campaigns only: nothing here calls Meta Ads.
export const BOOST_MIN_DAILY_BUDGET = 200;
export const BOOST_MAX_DAILY_BUDGET = 1_000_000;
export const BOOST_MAX_DAYS = 90;

// The bounds the wizard's Advanced targeting sliders enforce (utils/boost.ts DEFAULT_AUDIENCE and the age/radius <input type="range"> min/max).
const TARGETING_GENDERS = ['all', 'male', 'female'] as const;
const TARGETING_AGE_MIN = 18;
const TARGETING_AGE_MAX = 65;
const TARGETING_RADIUS_MIN = 5;
const TARGETING_RADIUS_MAX = 50;
const TARGETING_CITY_MAX_LEN = 100;

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

/**
 * Only the fields the wizard actually sends survive: gender, ageMin/ageMax and
 * location.city/location.radius, each bounds-checked to the UI's own ranges. Everything else
 * (unknown top-level keys, extra keys inside location) is dropped rather than stored verbatim —
 * this is what a future Meta integration would read.
 */
function parseTargeting(input: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (input === undefined) return { ok: true, value: {} };
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return { ok: false, message: 'targeting must be an object' };
  const { gender, ageMin, ageMax, location } = input as Record<string, unknown>;
  const value: Record<string, unknown> = {};

  if (gender !== undefined) {
    if (typeof gender !== 'string' || !(TARGETING_GENDERS as readonly string[]).includes(gender)) {
      return { ok: false, message: `targeting.gender must be one of ${TARGETING_GENDERS.join(', ')}` };
    }
    value['gender'] = gender;
  }

  if (ageMin !== undefined) {
    if (typeof ageMin !== 'number' || !Number.isInteger(ageMin) || ageMin < TARGETING_AGE_MIN || ageMin > TARGETING_AGE_MAX) {
      return { ok: false, message: `targeting.ageMin must be a whole number from ${TARGETING_AGE_MIN} to ${TARGETING_AGE_MAX}` };
    }
  }
  if (ageMax !== undefined) {
    if (typeof ageMax !== 'number' || !Number.isInteger(ageMax) || ageMax < TARGETING_AGE_MIN || ageMax > TARGETING_AGE_MAX) {
      return { ok: false, message: `targeting.ageMax must be a whole number from ${TARGETING_AGE_MIN} to ${TARGETING_AGE_MAX}` };
    }
  }
  if (typeof ageMin === 'number' && typeof ageMax === 'number' && ageMin > ageMax) {
    return { ok: false, message: 'targeting.ageMin must not be greater than targeting.ageMax' };
  }
  if (typeof ageMin === 'number') value['ageMin'] = ageMin;
  if (typeof ageMax === 'number') value['ageMax'] = ageMax;

  if (location !== undefined) {
    if (location === null || typeof location !== 'object' || Array.isArray(location)) {
      return { ok: false, message: 'targeting.location must be an object' };
    }
    const { city, radius } = location as Record<string, unknown>;
    if (typeof city !== 'string' || !city.trim() || city.trim().length > TARGETING_CITY_MAX_LEN) {
      return { ok: false, message: `targeting.location.city must be a non-empty string of at most ${TARGETING_CITY_MAX_LEN} characters` };
    }
    if (typeof radius !== 'number' || !Number.isInteger(radius) || radius < TARGETING_RADIUS_MIN || radius > TARGETING_RADIUS_MAX) {
      return { ok: false, message: `targeting.location.radius must be a whole number of km from ${TARGETING_RADIUS_MIN} to ${TARGETING_RADIUS_MAX}` };
    }
    value['location'] = { city: city.trim(), radius };
  }

  return { ok: true, value };
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
  const targetingResult = parseTargeting(targeting);
  if (!targetingResult.ok) return { ok: false, message: targetingResult.message };
  return { ok: true, value: { postId: postId.trim(), dailyBudget, durationDays, targeting: targetingResult.value } };
}
