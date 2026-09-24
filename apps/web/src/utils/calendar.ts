import type { Post } from '../services/creative';
import type { PostStatus } from './posts.js';

export type CalendarView = 'week' | 'month';

/** One hour row: the reference's h-14. */
export const HOUR_PX = 56;
export const HOURS = Array.from({ length: 24 }, (_, h) => h);
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Reference colours for published/scheduled/draft/failed; ours for the approval and publishing states.
export const STATUS_DOT: Record<PostStatus, string> = {
  published: 'bg-emerald-500', scheduled: 'bg-amber-500', draft: 'bg-zinc-400', failed: 'bg-red-500',
  pending_approval: 'bg-violet-400', approved: 'bg-teal-500', publishing: 'bg-blue-400',
};
export const STATUS_STYLES: Record<PostStatus, string> = {
  published: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100',
  scheduled: 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
  draft: 'bg-zinc-100 text-zinc-600',
  failed: 'bg-red-50 text-red-700 ring-1 ring-red-100',
  pending_approval: 'bg-violet-50 text-violet-700 ring-1 ring-violet-100',
  approved: 'bg-teal-50 text-teal-700 ring-1 ring-teal-100',
  publishing: 'bg-blue-50 text-blue-700 ring-1 ring-blue-100',
};
export const STATUS_LABELS: Record<PostStatus, string> = {
  published: 'Published', scheduled: 'Scheduled', draft: 'Draft', failed: 'Failed',
  pending_approval: 'Awaiting approval', approved: 'Ready to publish', publishing: 'Publishing',
};

export interface CalendarPost {
  id: string;
  title: string;
  platforms: string[];
  status: PostStatus;
  date: Date;
  time: string;
}

export function toCalendarPosts(posts: ReadonlyArray<Pick<Post, 'id' | 'prompt_text' | 'platforms' | 'status' | 'scheduled_at' | 'published_at' | 'created_at'>>): CalendarPost[] {
  return posts.flatMap((p) => {
    // Drafts have no scheduled_at: fall back to the publish or creation time; skip rows with no usable date.
    const raw = p.scheduled_at ?? p.published_at ?? p.created_at;
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) return [];
    return [{
      id: p.id,
      title: p.prompt_text || 'Untitled Post',
      platforms: p.platforms ?? [],
      status: p.status,
      date,
      time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    }];
  });
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

/** Monday 00:00 of the week `offset` weeks from the one holding `today`. */
export function startOfWeek(today: Date, offset = 0): Date {
  const dow = today.getDay() || 7;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow + 1 + offset * 7);
}

export function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export function monthStart(today: Date, offset = 0): Date {
  return new Date(today.getFullYear(), today.getMonth() + offset, 1);
}

/** Month cells, Monday first: blanks before the 1st and after the last day fill whole weeks. */
export function monthCells(month: Date): Array<Date | null> {
  const lead = (month.getDay() || 7) - 1;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const n = i - lead + 1;
    return n >= 1 && n <= days ? new Date(month.getFullYear(), month.getMonth(), n) : null;
  });
}

export function visibleRange(view: CalendarView, weekStart: Date, month: Date): { start: Date; end: Date } {
  if (view === 'week') return { start: weekStart, end: new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7) };
  return { start: month, end: new Date(month.getFullYear(), month.getMonth() + 1, 1) };
}

/** "21 – 27 September 2026", "28 September – 4 October 2026", or across years with both years. */
export function formatWeekRange(days: readonly Date[]): string {
  const start = days[0];
  const end = days[days.length - 1];
  if (!start || !end) return '';
  const m = (d: Date) => MONTHS[d.getMonth()];
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getDate()} ${m(start)} ${start.getFullYear()} – ${end.getDate()} ${m(end)} ${end.getFullYear()}`;
  }
  if (start.getMonth() !== end.getMonth()) return `${start.getDate()} ${m(start)} – ${end.getDate()} ${m(end)} ${end.getFullYear()}`;
  return `${start.getDate()} – ${end.getDate()} ${m(end)} ${end.getFullYear()}`;
}

export function formatMonthTitle(month: Date): string {
  return `${MONTHS[month.getMonth()]} ${month.getFullYear()}`;
}

export function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

/** Posts on a day (and, for the week grid, in one hour), earliest first. */
export function postsAt(posts: readonly CalendarPost[], day: Date, hour?: number): CalendarPost[] {
  return posts
    .filter((p) => sameDay(p.date, day) && (hour === undefined || p.date.getHours() === hour))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function createLink(day: Date, hour?: number): string {
  const date = `/create?date=${dayKey(day)}`;
  return hour === undefined ? date : `${date}&time=${String(hour).padStart(2, '0')}:00`;
}

export function nowLineTop(now: Date): number {
  return (now.getHours() + now.getMinutes() / 60) * HOUR_PX;
}

/** The week grid opens an hour before now. */
export function initialScrollTop(now: Date): number {
  return Math.max(0, now.getHours() - 1) * HOUR_PX;
}

export function isReschedulable(status: PostStatus): boolean {
  return status === 'scheduled' || status === 'draft';
}

/** A week-grid drop keeps the minutes and takes the slot's day and hour; a month-cell drop keeps the time of day. */
export function dropTime(original: Date, day: Date, hour: number | null): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour ?? original.getHours(), original.getMinutes());
}

export function tomorrowAt(now: Date, hour: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, 0, 0, 0);
}

export interface LegendCounts { published: number; scheduled: number; drafts: number }

export function legendCounts(posts: ReadonlyArray<Pick<CalendarPost, 'status'>>): LegendCounts {
  return {
    published: posts.filter((p) => p.status === 'published').length,
    scheduled: posts.filter((p) => p.status === 'scheduled').length,
    drafts: posts.filter((p) => p.status === 'draft').length,
  };
}

export function chipTitle(post: CalendarPost, view: CalendarView, draggable: boolean): string {
  const base = view === 'week' ? `${post.time} · ${post.title}` : `${post.title} — ${STATUS_LABELS[post.status]}`;
  return draggable ? `${base} (drag to reschedule)` : base;
}

/** A GET /dealer/festivals row. `date` is YYYY-MM-DD, or an ISO timestamp from the upcoming list. */
export interface FestivalDate {
  name: string;
  name_en?: string;
  date: string;
  marketingIdea?: string;
}

export interface FestivalMark {
  name: string;
  emoji: string;
  idea?: string;
}

// The reference's emoji table, matched on the English name; 🎉 for anything else.
const FESTIVAL_EMOJI: Array<[RegExp, string]> = [
  [/diwali|deepavali/i, '\u{1FA94}'], [/dhanteras/i, '\u{1FA99}'], [/holi/i, '\u{1F3A8}'], [/eid/i, '\u{1F319}'],
  [/raksha|rakhi/i, '\u{1F9E1}'], [/janmashtami|krishna/i, '\u{1FA88}'], [/ganesh/i, '\u{1F418}'], [/navratri|durga/i, '\u{1F483}'],
  [/dussehra|vijayadashami/i, '\u{1F3AF}'], [/karwa/i, '\u{1F315}'], [/bhai dooj/i, '\u{1F46B}'], [/chhath/i, '\u{1F305}'],
  [/guru nanak|gurpurab/i, '\u{1F64F}'], [/ugadi|gudi/i, '\u{1F338}'], [/onam/i, '\u{1F33C}'], [/shivratri|shivaratri/i, '\u{1F531}'],
  [/ram navami/i, '\u{1F64F}'], [/akshaya/i, '\u{2728}'], [/buddha/i, '\u{262E}\u{FE0F}'], [/christmas/i, '\u{1F384}'],
  [/republic|independence/i, '\u{1F1EE}\u{1F1F3}'], [/pongal|sankranti/i, '\u{1FA81}'], [/baisakhi/i, '\u{1F33E}'], [/lohri/i, '\u{1F525}'],
];

export function festivalEmoji(name: string): string {
  return FESTIVAL_EMOJI.find(([re]) => re.test(name))?.[1] ?? '\u{1F389}';
}

/** Festivals by local day key, once per name per day. */
export function festivalsByDay(list: readonly FestivalDate[]): Map<string, FestivalMark[]> {
  const map = new Map<string, FestivalMark[]>();
  for (const f of list) {
    const key = f.date.slice(0, 10);
    const name = f.name_en || f.name;
    const marks = map.get(key) ?? [];
    if (!marks.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      marks.push({ name, emoji: festivalEmoji(name), ...(f.marketingIdea ? { idea: f.marketingIdea } : {}) });
    }
    map.set(key, marks);
  }
  return map;
}

/** Our "festival suggestions" extra: a festival chip opens Create on that day, prefilled with the festival's idea. */
export function festivalCreateLink(day: Date, festival: FestivalMark): string {
  const prompt = `${festival.name}: ${festival.idea ?? `${festival.name} offer post`}`.slice(0, 500);
  return `${createLink(day)}&prompt=${encodeURIComponent(prompt)}`;
}
