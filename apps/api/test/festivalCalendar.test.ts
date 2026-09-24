import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FESTIVALS, festivalRange, festivalsBetween, getUpcomingFestivals, resolveState } from '../src/services/festivalCalendar.js';

describe('Festival Calendar (festivalCalendar.ts)', () => {
  it('contains comprehensive database of major Indian festivals', () => {
    assert.ok(FESTIVALS.length >= 10);
    const festivalIds = FESTIVALS.map((f) => f.id);
    assert.ok(festivalIds.includes('diwali'));
    assert.ok(festivalIds.includes('holi'));
    assert.ok(festivalIds.includes('dussehra'));
  });

  it('returns upcoming festivals sorted by date ascending', () => {
    const upcoming = getUpcomingFestivals(null, null, 5);
    assert.ok(Array.isArray(upcoming));
    assert.ok(upcoming.length > 0 && upcoming.length <= 5);

    for (let i = 1; i < upcoming.length; i++) {
      assert.ok(
        upcoming[i]!.date.getTime() >= upcoming[i - 1]!.date.getTime(),
        'Festivals should be chronologically ordered'
      );
    }
  });

  it('calculates positive daysRemaining for future festivals', () => {
    const upcoming = getUpcomingFestivals(null, null, 3);
    for (const fest of upcoming) {
      assert.ok(fest.daysRemaining >= 0, `daysRemaining should be non-negative for ${fest.name}`);
      assert.ok(fest.marketingIdea.length > 0, 'marketingIdea should be present');
    }
  });

  it('resolves regional state from city name', () => {
    // Delhi city should resolve to Delhi state
    const delhiFestivals = getUpcomingFestivals('Delhi', null, 10);
    assert.ok(Array.isArray(delhiFestivals));

    // Mumbai city should resolve to Maharashtra
    const mumbaiFestivals = getUpcomingFestivals('Mumbai', null, 10);
    assert.ok(Array.isArray(mumbaiFestivals));
  });

  it('handles null, undefined, or unexpected types without throwing', () => {
    assert.doesNotThrow(() => {
      getUpcomingFestivals(undefined, undefined, 2);
      getUpcomingFestivals(null, null, 2);
      getUpcomingFestivals('NonExistentCity', null, 2);
    });
  });
});

describe('festivals by date range (Calendar)', () => {
  it('includes the start date and excludes the end date, in date order', () => {
    const list = festivalsBetween(null, null, '2026-10-20', '2026-11-08');
    assert.ok(list.some((f) => f.id === 'dussehra' && f.date === '2026-10-20'));
    assert.ok(!list.some((f) => f.id === 'diwali'), 'Diwali 2026-11-08 is the exclusive end');
    assert.deepEqual(list.map((f) => f.date), [...list.map((f) => f.date)].sort());
  });

  it("keeps regional festivals to the dealer's state", () => {
    const pune = festivalsBetween('Pune', null, '2026-09-01', '2026-10-01').map((f) => f.id);
    const delhi = festivalsBetween('Delhi', null, '2026-09-01', '2026-10-01').map((f) => f.id);
    assert.ok(pune.includes('ganesh_chaturthi'));
    assert.ok(!delhi.includes('ganesh_chaturthi'));
  });

  it('covers every year in the table', () => {
    const christmas = festivalsBetween(null, null, '2026-01-01', '2028-01-01').filter((f) => f.id === 'christmas').map((f) => f.date);
    assert.deepEqual(christmas, ['2026-12-25', '2027-12-25']);
    // A Pune-regional festival across both years in the table: catches a broken or emptied festival feed.
    const ganeshChaturthi = festivalsBetween('Pune', null, '2026-01-01', '2028-01-01').filter((f) => f.id === 'ganesh_chaturthi').map((f) => f.date);
    assert.deepEqual(ganeshChaturthi, ['2026-09-15', '2027-09-04']);
  });

  it('finds the state from the city unless one is given', () => {
    assert.equal(resolveState('Mumbai', null), 'Maharashtra');
    assert.equal(resolveState('Mumbai', 'Goa'), 'Goa');
    assert.equal(resolveState('Atlantis', null), null);
    assert.equal(resolveState(null, null), null);
  });

  it('accepts only real, ordered ranges up to 1100 days', () => {
    assert.deepEqual(festivalRange('2025-01-01', '2028-01-01'), { from: '2025-01-01', to: '2028-01-01' });
    assert.equal(festivalRange('2026-10-01', '2026-09-01'), null);
    assert.equal(festivalRange('2026-9-1', '2026-10-01'), null);
    assert.equal(festivalRange('2026-02-31', '2026-03-10'), null);
    assert.equal(festivalRange('2020-01-01', '2026-01-01'), null);
    assert.equal(festivalRange(undefined, '2026-01-01'), null);
    // A known Pune-regional festival within a concrete range: catches a broken or emptied festival feed.
    assert.equal(festivalsBetween('Pune', null, '2026-01-01', '2026-02-01').find((f) => f.id === 'makar_sankranti')?.date, '2026-01-14');
  });
});
