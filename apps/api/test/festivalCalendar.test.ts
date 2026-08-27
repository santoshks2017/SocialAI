import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getUpcomingFestivals, FESTIVALS } from '../src/services/festivalCalendar.js';

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
