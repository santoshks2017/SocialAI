import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR_PX, chipTitle, createLink, dayKey, dropTime, festivalCreateLink, festivalEmoji, festivalsByDay, formatMonthTitle, formatWeekRange,
  hourLabel, initialScrollTop, isReschedulable, legendCounts, monthCells, monthStart, monthsBetween, nowLineTop, postsAt, startOfWeek,
  toCalendarPosts, tomorrowAt, visibleRange, weekDays, weeksBetween,
} from './calendar.js';

// Local-time dates: the calendar works in the browser's time zone.
const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

describe('calendar dates', () => {
  it('starts weeks on Monday', () => {
    assert.equal(dayKey(startOfWeek(d(2026, 9, 24))), '2026-09-21');
    assert.equal(dayKey(startOfWeek(d(2026, 9, 27))), '2026-09-21');
    assert.equal(dayKey(startOfWeek(d(2026, 9, 24), 1)), '2026-09-28');
    assert.deepEqual(weekDays(d(2026, 9, 21)).map(dayKey), ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']);
  });

  it('keeps the viewed week anchored to the week the page opened in', () => {
    // Opened late on Sunday 27 September; the live clock then crosses into Monday.
    const anchor = d(2026, 9, 27, 23, 59);
    const liveNow = d(2026, 9, 28, 0, 1);
    // Two weeks ahead stays the same week however the clock moves.
    assert.equal(dayKey(startOfWeek(anchor, 2)), '2026-10-05');
    assert.notEqual(dayKey(startOfWeek(liveNow, 2)), dayKey(startOfWeek(anchor, 2)));
    // "Today" jumps to the actual current week, one week on from the anchor.
    assert.equal(weeksBetween(anchor, liveNow), 1);
    assert.equal(dayKey(startOfWeek(anchor, weeksBetween(anchor, liveNow))), '2026-09-28');
    assert.equal(weeksBetween(anchor, anchor), 0);
    assert.equal(weeksBetween(d(2026, 12, 30), d(2027, 1, 5)), 1);
    assert.equal(weeksBetween(d(2026, 9, 24), d(2026, 9, 10)), -2);
  });

  it('keeps the viewed month anchored the same way', () => {
    const anchor = d(2026, 12, 31, 23, 59);
    assert.equal(monthsBetween(anchor, d(2027, 1, 1, 0, 1)), 1);
    assert.equal(monthsBetween(anchor, anchor), 0);
    assert.equal(formatMonthTitle(monthStart(anchor, monthsBetween(anchor, d(2027, 1, 1)))), 'January 2027');
  });

  it('titles weeks and months', () => {
    assert.equal(formatWeekRange(weekDays(d(2026, 9, 21))), '21 – 27 September 2026');
    assert.equal(formatWeekRange(weekDays(d(2026, 9, 28))), '28 September – 4 October 2026');
    assert.equal(formatWeekRange(weekDays(d(2026, 12, 28))), '28 December 2026 – 3 January 2027');
    assert.equal(formatMonthTitle(d(2026, 9, 1)), 'September 2026');
  });

  it('lays a month out Monday-first in whole weeks', () => {
    const cells = monthCells(d(2026, 9, 1));
    assert.equal(cells.length % 7, 0);
    assert.equal(cells[0], null);
    assert.equal(dayKey(cells[1]!), '2026-09-01');
    assert.equal(cells.filter(Boolean).length, 30);
  });

  it('fetches only the visible range', () => {
    const week = visibleRange('week', d(2026, 9, 21), d(2026, 9, 1));
    assert.deepEqual([dayKey(week.start), dayKey(week.end)], ['2026-09-21', '2026-09-28']);
    const month = visibleRange('month', d(2026, 9, 21), d(2026, 9, 1));
    assert.deepEqual([dayKey(month.start), dayKey(month.end)], ['2026-09-01', '2026-10-01']);
  });

  it('places the now line and the first scroll', () => {
    assert.equal(nowLineTop(d(2026, 9, 24, 9, 30)), 9.5 * HOUR_PX);
    assert.equal(initialScrollTop(d(2026, 9, 24, 9, 30)), 8 * HOUR_PX);
    assert.equal(initialScrollTop(d(2026, 9, 24, 0, 10)), 0);
    assert.deepEqual([hourLabel(0), hourLabel(9), hourLabel(12), hourLabel(18)], ['12 AM', '9 AM', '12 PM', '6 PM']);
  });
});

describe('calendar posts', () => {
  const posts = toCalendarPosts([
    { id: 'a', prompt_text: 'Diwali offer', platforms: ['facebook'], status: 'scheduled', scheduled_at: d(2026, 9, 24, 9, 30).toISOString(), created_at: '2026-09-01T00:00:00Z' },
    { id: 'b', prompt_text: '', platforms: [], status: 'draft', created_at: d(2026, 9, 24, 9, 5).toISOString() },
    { id: 'c', prompt_text: 'Published', platforms: ['instagram'], status: 'published', published_at: d(2026, 9, 25, 18).toISOString(), created_at: '2026-09-01T00:00:00Z' },
    { id: 'x', prompt_text: 'No date', platforms: [], status: 'draft', created_at: 'not a date' },
  ]);

  it('dates drafts by creation and skips posts with no usable date', () => {
    assert.deepEqual(posts.map((p) => p.id), ['a', 'b', 'c']);
    assert.equal(posts[1]!.title, 'Untitled Post');
  });

  it('finds posts by day and hour, earliest first', () => {
    assert.deepEqual(postsAt(posts, d(2026, 9, 24), 9).map((p) => p.id), ['b', 'a']);
    assert.deepEqual(postsAt(posts, d(2026, 9, 24)).map((p) => p.id), ['b', 'a']);
    assert.deepEqual(postsAt(posts, d(2026, 9, 25), 9), []);
  });

  it('counts the legend and titles chips like the reference', () => {
    assert.deepEqual(legendCounts(posts), { published: 1, scheduled: 1, drafts: 1 });
    assert.equal(chipTitle(posts[0]!, 'week', true), `${posts[0]!.time} · Diwali offer (drag to reschedule)`);
    assert.equal(chipTitle(posts[2]!, 'month', false), 'Published — Published');
  });

  it('moves a dropped post and keeps the right time', () => {
    const original = d(2026, 9, 24, 9, 30);
    assert.equal(dropTime(original, d(2026, 9, 26), 14).getTime(), d(2026, 9, 26, 14, 30).getTime());
    assert.equal(dropTime(original, d(2026, 9, 26), null).getTime(), d(2026, 9, 26, 9, 30).getTime());
    assert.equal(tomorrowAt(d(2026, 9, 30, 22), 9).getTime(), d(2026, 10, 1, 9).getTime());
    assert.deepEqual((['scheduled', 'draft', 'published', 'failed'] as const).map((s) => isReschedulable(s)), [true, true, false, false]);
  });

  it('links an empty slot to Create', () => {
    assert.equal(createLink(d(2026, 9, 24), 9), '/create?date=2026-09-24&time=09:00');
    assert.equal(createLink(d(2026, 9, 24)), '/create?date=2026-09-24');
  });
});

describe('calendar festivals', () => {
  it('picks an emoji from the English name', () => {
    assert.equal(festivalEmoji('Diwali (Deepavali)'), '\u{1FA94}');
    assert.equal(festivalEmoji('Dussehra (Vijayadashami)'), '\u{1F3AF}');
    assert.equal(festivalEmoji('Republic Day'), '\u{1F1EE}\u{1F1F3}');
    assert.equal(festivalEmoji('Onam'), '\u{1F33C}');
    assert.equal(festivalEmoji('Some new festival'), '\u{1F389}');
  });

  it('groups festivals by day, once per name', () => {
    const map = festivalsByDay([
      { name: 'Pongal', date: '2026-01-14', marketingIdea: 'Pongal exchange offers' },
      { name: 'Makar Sankranti', date: '2026-01-14' },
      { name: 'pongal', date: '2026-01-14T00:00:00.000Z' },
    ]);
    assert.deepEqual(map.get('2026-01-14')?.map((f) => f.name), ['Pongal', 'Makar Sankranti']);
    assert.equal(map.get('2026-01-14')?.[0]?.idea, 'Pongal exchange offers');
  });

  it("opens Create with the festival's idea", () => {
    const link = festivalCreateLink(d(2026, 11, 8), { name: 'Diwali', emoji: '', idea: 'Diwali Dhamaka offers' });
    assert.equal(link, `/create?date=2026-11-08&prompt=${encodeURIComponent('Diwali: Diwali Dhamaka offers')}`);
  });
});
