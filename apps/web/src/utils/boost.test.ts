import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { BoostCampaign, BoostStats } from '../services/boost';
import {
  DEFAULT_AUDIENCE, MAX_DAILY_BUDGET, audienceSummary, avgCtr, budgetError, budgetValid, campaignMetrics, campaignsLine, daysLeft, effectiveBudget,
  inTab, postsLoadState, reachLine, scheduleLine, spendBar, targetingFor, totalBudget,
} from './boost.js';

const NOW = new Date('2026-09-24T10:00:00Z');
const DAY = 86_400_000;
const campaign = (over: Partial<BoostCampaign>): BoostCampaign => ({
  id: 'c1', dealerId: 'd1', postId: 'p1', dailyBudget: 1000, durationDays: 7,
  targeting: { location: { city: 'Pune', radius: 25 }, ageMin: 25, ageMax: 55 }, status: 'active', totalSpent: 0,
  createdAt: '2026-09-20T00:00:00Z', ...over,
});
const stats = (over: Partial<BoostStats>): BoostStats => ({
  totalSpendThisMonth: 0, totalReachThisMonth: 0, totalClicksThisMonth: 0, avgCtr: 0, campaignsThisMonth: 0, ...over,
});

describe('boost helpers', () => {
  it('lists drafts with active and paused campaigns', () => {
    assert.deepEqual((['draft', 'active', 'paused', 'completed'] as const).map((s) => inTab(s, 'active')), [true, true, true, false]);
    assert.equal(inTab('completed', 'completed'), true);
  });

  it('works out days left and the schedule line', () => {
    assert.equal(daysLeft(campaign({ endDate: new Date(NOW.getTime() + 2.2 * DAY).toISOString() }), NOW), 3);
    assert.equal(daysLeft(campaign({ endDate: new Date(NOW.getTime() - DAY).toISOString() }), NOW), 0);
    assert.equal(daysLeft(campaign({ endDate: undefined }), NOW), 7);
    assert.equal(scheduleLine(campaign({ endDate: new Date(NOW.getTime() + 0.5 * DAY).toISOString() }), NOW), '1 day left · ₹1,000/day');
    assert.equal(scheduleLine(campaign({ endDate: new Date(NOW.getTime() - DAY).toISOString() }), NOW), 'Campaign ended · ₹1,000/day');
    assert.equal(totalBudget(campaign({})), 7000);
  });

  it('colours the spend bar by how much budget is used', () => {
    assert.deepEqual(spendBar(0, 7000), { width: 0, tone: 'blue' });
    assert.equal(spendBar(6000, 7000).tone, 'yellow');
    assert.deepEqual(spendBar(8000, 7000), { width: 100, tone: 'red' });
  });

  it('shows metrics only once they are reported', () => {
    assert.deepEqual(campaignMetrics(campaign({})), { reach: '—', clicks: '—', ctr: '—', cpc: '—' });
    const reported = campaign({ totalSpent: 4800, metrics: { reach: 12000, impressions: 20000, clicks: 240, ctr: 2, cpc: 20, spend: 4800 } });
    assert.deepEqual(campaignMetrics(reported), { reach: '12,000', clicks: '240', ctr: '2.0%', cpc: '₹20' });
    assert.equal(campaignMetrics(campaign({ metrics: { reach: 10, impressions: 10, clicks: 0, ctr: 0, cpc: 0, spend: 0 } })).cpc, '—');
  });

  it('summarises the month', () => {
    assert.equal(avgCtr(stats({})), '—');
    assert.equal(avgCtr(stats({ totalReachThisMonth: 10000, totalClicksThisMonth: 200 })), '2.0%');
    assert.equal(campaignsLine(1), 'across 1 campaign');
    assert.equal(campaignsLine(3), 'across 3 campaigns');
  });

  it('describes reach and the audience', () => {
    assert.equal(reachLine({ minReach: 12000, maxReach: 20000 }), '~12,000–20,000 people/day');
    assert.equal(audienceSummary(DEFAULT_AUDIENCE), 'Smart (25–55, 25 km)');
    assert.equal(audienceSummary({ radius: 10, ageMin: 30, ageMax: 45, gender: 'female' }), '30–45, 10 km, Female');
  });

  it('never throws on a missing or broken reach estimate', () => {
    assert.equal(reachLine(null), '—');
    assert.equal(reachLine(undefined), '—');
    assert.equal(reachLine({ minReach: Infinity, maxReach: Infinity }), '—');
    assert.equal(reachLine({ minReach: NaN, maxReach: 20000 }), '—');
  });

  it('reads the budget and builds the targeting the API stores', () => {
    assert.equal(effectiveBudget(1000, ''), 1000);
    assert.equal(effectiveBudget(1000, '750'), 750);
    assert.equal(effectiveBudget(1000, 'abc'), 0);
    assert.equal(budgetValid(200), true);
    assert.equal(budgetValid(199), false);
    assert.equal(budgetValid(250.5), false);
    assert.equal(budgetValid(MAX_DAILY_BUDGET), true);
    assert.equal(budgetValid(MAX_DAILY_BUDGET + 1), false);
    assert.deepEqual(targetingFor('Pune', { radius: 10, ageMin: 30, ageMax: 45, gender: 'male' }), {
      location: { city: 'Pune', radius: 10 }, ageMin: 30, ageMax: 45, gender: 'male',
    });
    assert.equal(targetingFor(undefined, DEFAULT_AUDIENCE).location.city, 'India');
  });

  it('gives a clear reason a budget is invalid', () => {
    assert.equal(budgetError(1000), null);
    assert.equal(budgetError(199), 'Minimum budget is ₹200/day.');
    assert.equal(budgetError(MAX_DAILY_BUDGET + 1), 'Maximum budget is ₹10,00,000/day.');
    assert.equal(budgetError(250.5), 'Enter a whole number of rupees.');
  });

  it('decides what step 1 of the wizard shows for the posts load', () => {
    assert.equal(postsLoadState(false, false, 0), 'loading');
    assert.equal(postsLoadState(true, true, 0), 'error');
    assert.equal(postsLoadState(true, false, 0), 'empty');
    assert.equal(postsLoadState(true, false, 3), 'ready');
    // A failed load takes priority even if a stale post list is still around.
    assert.equal(postsLoadState(true, true, 3), 'error');
  });
});
