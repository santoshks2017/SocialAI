import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button, cn } from '../components/ui/Button';
import { PageCard } from '../components/ui/PageCard';
import { useToast } from '../components/ui/Toast';
import { CalendarLegend, MonthGrid, WeekGrid } from '../components/calendar/CalendarGrids';
import { PostDetailModal } from '../components/calendar/PostDetailModal';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSIONS, can } from '../lib/permissions';
import { ApiError } from '../services/api';
import { postService, type Post } from '../services/creative';
import { dealerService } from '../services/dealer';
import {
  createLink, dropTime, festivalCreateLink, festivalsByDay, formatMonthTitle, formatWeekRange, initialScrollTop, isReschedulable, legendCounts,
  monthStart, startOfWeek, toCalendarPosts, visibleRange, weekDays, type CalendarPost, type CalendarView, type FestivalDate, type FestivalMark,
} from '../utils/calendar';

export default function CalendarPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { user } = useAuth();
  const canPublish = can(user, PERMISSIONS.PUBLISH_POST);
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [apiPosts, setApiPosts] = useState<Post[]>([]);
  const [festivalList, setFestivalList] = useState<FestivalDate[]>([]);
  const [selected, setSelected] = useState<CalendarPost | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The red now line moves every minute.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const weekStart = startOfWeek(now, weekOffset);
  const days = weekDays(weekStart);
  const month = monthStart(now, monthOffset);
  const range = visibleRange(view, weekStart, month);
  const fromIso = range.start.toISOString();
  const toIso = range.end.toISOString();

  useEffect(() => {
    let cancelled = false;
    postService.getCalendar(fromIso, toIso)
      .then((res) => { if (!cancelled) setApiPosts(res.data ?? []); })
      .catch(() => {
        if (!cancelled) addToast({ type: 'error', title: 'Could not load calendar', message: 'Please refresh to try again.' });
      });
    return () => { cancelled = true; };
  }, [fromIso, toIso, reloadKey, addToast]);

  // Festivals once, from last January to the end of next year: region-aware, from GET /dealer/festivals.
  const festivalYear = now.getFullYear();
  useEffect(() => {
    let cancelled = false;
    dealerService.festivals(`${festivalYear - 1}-01-01`, `${festivalYear + 2}-01-01`)
      .then((res) => { if (!cancelled) setFestivalList(res.festivals); })
      .catch(() => { /* the calendar still works without the festival overlay */ });
    return () => { cancelled = true; };
  }, [festivalYear]);

  // The week view opens around the current hour.
  useEffect(() => {
    if (view === 'week' && scrollRef.current) scrollRef.current.scrollTop = initialScrollTop(new Date());
  }, [view, weekOffset]);

  const posts = useMemo(() => toCalendarPosts(apiPosts), [apiPosts]);
  const festivals = useMemo(() => festivalsByDay(festivalList), [festivalList]);
  const canDragPost = (post: CalendarPost) => canPublish && isReschedulable(post.status);

  const reschedule = async (id: string, iso: string): Promise<boolean> => {
    try {
      await postService.reschedule(id, iso);
      addToast({ type: 'success', title: 'Rescheduled' });
      setReloadKey((k) => k + 1);
      return true;
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Couldn’t reschedule',
        message: err instanceof ApiError && err.status >= 400 && err.status < 500 ? err.message : 'The post could not be moved. Please try again.',
      });
      return false;
    }
  };

  const cancelSchedule = async (id: string): Promise<boolean> => {
    try {
      await postService.cancelSchedule(id);
      addToast({ type: 'success', title: 'Schedule cancelled', message: 'The post is back in your drafts.' });
      setReloadKey((k) => k + 1);
      return true;
    } catch (err) {
      addToast({ type: 'error', title: 'Cancel failed', message: err instanceof Error && err.message ? err.message : 'Could not cancel. Try again.' });
      return false;
    }
  };

  const dropPost = (postId: string, day: Date, hour: number | null) => {
    setDragging(false);
    const post = posts.find((p) => p.id === postId);
    if (!post || !canDragPost(post)) return;
    const when = dropTime(post.date, day, hour);
    if (when.getTime() <= Date.now()) {
      addToast({ type: 'warning', title: 'Can’t schedule in the past', message: 'Drop the post on a future date or time slot.' });
      return;
    }
    if (when.getTime() !== post.date.getTime()) void reschedule(post.id, when.toISOString());
  };

  const openFestival = (day: Date, festival: FestivalMark) => navigate(festivalCreateLink(day, festival));
  const shift = (delta: number) => (view === 'week' ? setWeekOffset((o) => o + delta) : setMonthOffset((o) => o + delta));
  const goToday = () => (view === 'week' ? setWeekOffset(0) : setMonthOffset(0));
  const grid = { festivals, dragging, canDragPost, onOpen: setSelected, onDropPost: dropPost, onDragState: setDragging, onFestival: openFestival };

  return (
    <PageCard>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="inline-flex items-center rounded-xl border border-zinc-200 bg-white overflow-hidden flex-shrink-0">
            <button type="button" aria-label="Previous" onClick={() => shift(-1)} className="h-9 w-9 grid place-items-center text-zinc-500 hover:bg-zinc-50 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={goToday} className="h-9 px-3 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 border-x border-zinc-200 transition-colors">
              Today
            </button>
            <button type="button" aria-label="Next" onClick={() => shift(1)} className="h-9 w-9 grid place-items-center text-zinc-500 hover:bg-zinc-50 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 truncate">{view === 'week' ? formatWeekRange(days) : formatMonthTitle(month)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Calendar view" className="inline-flex bg-zinc-100/80 rounded-xl p-1 gap-1">
            {(['week', 'month'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn('px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all', view === v ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-800')}
              >
                {v === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          <Button onClick={() => navigate('/create')}><Plus className="w-4 h-4" /> New Post</Button>
        </div>
      </div>

      <CalendarLegend counts={legendCounts(posts)} />

      {view === 'week' ? (
        <WeekGrid {...grid} days={days} now={now} posts={posts} scrollRef={scrollRef} onSlot={(day, hour) => navigate(createLink(day, hour))} />
      ) : (
        <MonthGrid {...grid} month={month} now={now} posts={posts} onAdd={(day) => navigate(createLink(day))} />
      )}

      {selected && (
        <PostDetailModal post={selected} canPublish={canPublish} onClose={() => setSelected(null)} onCancel={cancelSchedule} onReschedule={reschedule} />
      )}
    </PageCard>
  );
}
