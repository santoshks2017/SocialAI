import type { BoostCampaign, BoostStats, TargetingSpec } from '../services/boost';
import { rupees } from './billing.js';

export type CampaignStatus = BoostCampaign['status'];
export type BoostTab = 'active' | 'completed';

export interface Audience {
  radius: number;
  ageMin: number;
  ageMax: number;
  gender: 'all' | 'male' | 'female';
}

export const BUDGET_PRESETS = [500, 1000, 2500, 5000] as const;
export const DURATION_PRESETS = [3, 7, 14, 30] as const;
export const MIN_DAILY_BUDGET = 200;
// Same as the API's BOOST_MAX_DAILY_BUDGET (apps/api/src/lib/boostView.ts) — ₹10,00,000.
export const MAX_DAILY_BUDGET = 1_000_000;
export const WIZARD_STEPS = ['Post', 'Budget', 'Duration', 'Audience', 'Confirm'] as const;
export const DEFAULT_AUDIENCE: Audience = { radius: 25, ageMin: 25, ageMax: 55, gender: 'all' };

export type PostsLoadState = 'loading' | 'error' | 'empty' | 'ready';

/** What step 1 of the wizard shows, from the load outcome alone. */
export function postsLoadState(loaded: boolean, failed: boolean, count: number): PostsLoadState {
  if (!loaded) return 'loading';
  if (failed) return 'error';
  return count === 0 ? 'empty' : 'ready';
}

const DAY_MS = 86_400_000;

/** "Active & Paused" includes drafts too; the reference dropped them from both tabs. */
export function inTab(status: CampaignStatus, tab: BoostTab): boolean {
  return tab === 'completed' ? status === 'completed' : status !== 'completed';
}

export function daysLeft(c: Pick<BoostCampaign, 'endDate' | 'durationDays'>, now: Date): number {
  if (!c.endDate) return c.durationDays;
  return Math.max(0, Math.ceil((new Date(c.endDate).getTime() - now.getTime()) / DAY_MS));
}

export function scheduleLine(c: Pick<BoostCampaign, 'endDate' | 'durationDays' | 'dailyBudget'>, now: Date): string {
  const left = daysLeft(c, now);
  const when = left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : 'Campaign ended';
  return `${when} · ${rupees(c.dailyBudget)}/day`;
}

export function totalBudget(c: Pick<BoostCampaign, 'dailyBudget' | 'durationDays'>): number {
  return c.dailyBudget * c.durationDays;
}

export function spendBar(spent: number, budget: number): { width: number; tone: 'red' | 'yellow' | 'blue' } {
  const ratio = budget > 0 ? (spent / budget) * 100 : 0;
  return { width: Math.min(ratio, 100), tone: ratio > 100 ? 'red' : ratio > 80 ? 'yellow' : 'blue' };
}

/** Reach, clicks, CTR and CPC as shown, or "—" until metrics are reported (boosts are recorded, not run on Meta). */
export function campaignMetrics(c: Pick<BoostCampaign, 'metrics' | 'totalSpent'>): { reach: string; clicks: string; ctr: string; cpc: string } {
  const m = c.metrics;
  if (!m) return { reach: '—', clicks: '—', ctr: '—', cpc: '—' };
  const clicks = m.clicks ?? 0;
  return {
    reach: (m.reach ?? 0).toLocaleString('en-IN'),
    clicks: clicks.toLocaleString('en-IN'),
    ctr: `${(m.ctr ?? 0).toFixed(1)}%`,
    cpc: clicks > 0 ? rupees(Math.round(c.totalSpent / clicks)) : '—',
  };
}

export function avgCtr(stats: BoostStats): string {
  return stats.totalReachThisMonth > 0 ? `${((stats.totalClicksThisMonth / stats.totalReachThisMonth) * 100).toFixed(1)}%` : '—';
}

export function campaignsLine(count: number): string {
  return `across ${count} campaign${count === 1 ? '' : 's'}`;
}

export function reachLine(r: { minReach: number; maxReach: number } | null | undefined): string {
  if (!r || !Number.isFinite(r.minReach) || !Number.isFinite(r.maxReach)) return '—';
  return `~${r.minReach.toLocaleString('en-IN')}–${r.maxReach.toLocaleString('en-IN')} people/day`;
}

export function audienceSummary(a: Audience): string {
  if (a.ageMin === DEFAULT_AUDIENCE.ageMin && a.ageMax === DEFAULT_AUDIENCE.ageMax && a.gender === 'all') {
    return `Smart (25–55, ${a.radius} km)`;
  }
  const gender = a.gender === 'all' ? '' : `, ${a.gender === 'male' ? 'Male' : 'Female'}`;
  return `${a.ageMin}–${a.ageMax}, ${a.radius} km${gender}`;
}

/** The custom amount wins when typed; a non-number counts as 0 (invalid). */
export function effectiveBudget(preset: number, custom: string): number {
  if (!custom.trim()) return preset;
  const n = Number(custom);
  return Number.isFinite(n) ? n : 0;
}

export function budgetValid(amount: number): boolean {
  return budgetError(amount) === null;
}

/** null when the amount is a valid whole-rupee budget; otherwise the reason to show inline. */
export function budgetError(amount: number): string | null {
  if (!Number.isInteger(amount)) return 'Enter a whole number of rupees.';
  if (amount < MIN_DAILY_BUDGET) return `Minimum budget is ${rupees(MIN_DAILY_BUDGET)}/day.`;
  if (amount > MAX_DAILY_BUDGET) return `Maximum budget is ${rupees(MAX_DAILY_BUDGET)}/day.`;
  return null;
}

export function targetingFor(city: string | undefined, a: Audience): TargetingSpec {
  return { location: { city: city || 'India', radius: a.radius }, ageMin: a.ageMin, ageMax: a.ageMax, gender: a.gender };
}
