import { Fragment, type DragEvent, type RefObject } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../ui/Button';
import {
  HOURS, STATUS_DOT, WEEKDAYS, chipTitle, dayKey, hourLabel, monthCells, nowLineTop, postsAt, sameDay,
  type CalendarPost, type FestivalMark, type LegendCounts,
} from '../../utils/calendar';

const GRID_COLUMNS = '3.5rem repeat(7, minmax(0, 1fr))';

interface GridProps {
  now: Date;
  posts: CalendarPost[];
  festivals: Map<string, FestivalMark[]>;
  dragging: boolean;
  canDragPost: (post: CalendarPost) => boolean;
  onOpen: (post: CalendarPost) => void;
  onDropPost: (postId: string, day: Date, hour: number | null) => void;
  onDragState: (dragging: boolean) => void;
  onFestival: (day: Date, festival: FestivalMark) => void;
}

function dropHandler(onDropPost: GridProps['onDropPost'], day: Date, hour: number | null) {
  return (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) onDropPost(id, day, hour);
  };
}

export function CalendarLegend({ counts }: { counts: LegendCounts }) {
  const items = [
    { label: 'Published', dot: 'bg-emerald-500', n: counts.published },
    { label: 'Scheduled', dot: 'bg-amber-500', n: counts.scheduled },
    { label: 'Drafts', dot: 'bg-zinc-400', n: counts.drafts },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-xs text-zinc-500">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full', i.dot)} />
          {i.label}
          <span className="font-semibold text-zinc-800">{i.n}</span>
        </span>
      ))}
      <span>{'\u{1F389}'} Festivals shown</span>
    </div>
  );
}

function FestivalChip({ day, festival, onFestival }: { day: Date; festival: FestivalMark; onFestival: GridProps['onFestival'] }) {
  return (
    <button
      type="button"
      onClick={() => onFestival(day, festival)}
      title={festival.idea ?? festival.name}
      className="mt-0.5 block w-full truncate rounded bg-orange-50 px-1 text-left text-[9px] font-semibold leading-4 text-orange-700 hover:bg-orange-100 transition-colors"
    >
      {festival.emoji} {festival.name}
    </button>
  );
}

function PostChip({ post, view, draggable, onOpen, onDragState }: {
  post: CalendarPost;
  view: 'week' | 'month';
  draggable: boolean;
  onOpen: GridProps['onOpen'];
  onDragState: GridProps['onDragState'];
}) {
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', post.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragState(true);
      }}
      onDragEnd={() => onDragState(false)}
      onClick={() => onOpen(post)}
      title={chipTitle(post, view, draggable)}
      className={cn(
        'w-full flex items-center gap-1 px-1 py-0.5 rounded text-left',
        view === 'week' ? 'bg-white border border-zinc-200 shadow-sm hover:bg-zinc-50' : 'bg-zinc-50 border border-zinc-100 hover:bg-zinc-100 transition-colors',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', STATUS_DOT[post.status])} />
      <span className="text-[10px] font-medium text-zinc-700 truncate">{post.title}</span>
    </button>
  );
}

export function WeekGrid({ days, now, posts, festivals, dragging, canDragPost, onOpen, onDropPost, onDragState, onFestival, onSlot, scrollRef }: GridProps & {
  days: Date[];
  onSlot: (day: Date, hour: number) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const todayIndex = days.findIndex((d) => sameDay(d, now));
  return (
    <div className="rounded-xl border border-zinc-200 overflow-hidden">
      <div className="grid border-b border-zinc-200" style={{ gridTemplateColumns: GRID_COLUMNS }}>
        <div />
        {days.map((day, i) => (
          <div key={dayKey(day)} className={cn('px-1 py-2 text-center min-w-0 border-l border-zinc-100', i === todayIndex && 'bg-orange-50/50')}>
            <p className="text-[11px] font-medium text-zinc-400">{WEEKDAYS[i]}</p>
            <p className={cn('text-lg font-semibold leading-tight', i === todayIndex ? 'text-orange-600' : 'text-zinc-800')}>{day.getDate()}</p>
            {(festivals.get(dayKey(day)) ?? []).map((f) => <FestivalChip key={f.name} day={day} festival={f} onFestival={onFestival} />)}
          </div>
        ))}
      </div>
      <div ref={scrollRef} className="max-h-[560px] overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: GRID_COLUMNS }}>
          {HOURS.map((hour) => (
            <Fragment key={hour}>
              <div className="h-14 pr-1.5 pt-0.5 text-right text-[10px] text-zinc-400 border-t border-r border-zinc-100 select-none">{hourLabel(hour)}</div>
              {days.map((day, i) => (
                <div
                  key={`${dayKey(day)}-${hour}`}
                  title="Click to schedule a post at this time"
                  onClick={(e) => { if (e.target === e.currentTarget) onSlot(day, hour); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={dropHandler(onDropPost, day, hour)}
                  className={cn(
                    'h-14 border-t border-r border-zinc-100 p-0.5 space-y-0.5 overflow-hidden cursor-pointer transition-colors',
                    i === 6 && 'border-r-0',
                    i === todayIndex ? 'bg-orange-50/30' : 'hover:bg-orange-50/40',
                    dragging && 'hover:bg-orange-100/60',
                  )}
                >
                  {postsAt(posts, day, hour).map((p) => (
                    <PostChip key={p.id} post={p} view="week" draggable={canDragPost(p)} onOpen={onOpen} onDragState={onDragState} />
                  ))}
                </div>
              ))}
            </Fragment>
          ))}
          {todayIndex >= 0 && (
            <div
              className="absolute z-10 pointer-events-none"
              style={{ top: nowLineTop(now), left: `calc(3.5rem + ${todayIndex} * (100% - 3.5rem) / 7)`, width: 'calc((100% - 3.5rem) / 7)' }}
            >
              <div className="relative border-t-2 border-red-500">
                <span className="absolute -left-[3px] -top-[5px] w-2 h-2 rounded-full bg-red-500" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MonthGrid({ month, now, posts, festivals, dragging, canDragPost, onOpen, onDropPost, onDragState, onFestival, onAdd }: GridProps & {
  month: Date;
  onAdd: (day: Date) => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 overflow-hidden">
      <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50/60">
        {WEEKDAYS.map((d) => <div key={d} className="py-2 text-center text-[11px] font-semibold text-zinc-500">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {monthCells(month).map((day, i) => {
          if (!day) return <div key={`blank-${i}`} className={cn('min-h-[88px] border-r border-b border-zinc-100 bg-zinc-50/40', i % 7 === 6 && 'border-r-0')} />;
          const isToday = sameDay(day, now);
          const dayPosts = postsAt(posts, day);
          return (
            <div
              key={dayKey(day)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={dropHandler(onDropPost, day, null)}
              className={cn(
                'min-h-[88px] p-1.5 border-r border-b border-zinc-100 transition-colors',
                i % 7 === 6 && 'border-r-0',
                isToday ? 'bg-orange-50/40' : 'hover:bg-zinc-50/60',
                dragging && 'hover:bg-orange-100/60',
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={cn('text-[11px] font-semibold', isToday ? 'w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center' : 'text-zinc-700')}>
                  {day.getDate()}
                </span>
                <button
                  type="button"
                  onClick={() => onAdd(day)}
                  aria-label={`Add post on ${day.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`}
                  className="w-5 h-5 grid place-items-center rounded text-zinc-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              {(festivals.get(dayKey(day)) ?? []).map((f) => <FestivalChip key={f.name} day={day} festival={f} onFestival={onFestival} />)}
              <div className="space-y-0.5 mt-0.5">
                {dayPosts.slice(0, 2).map((p) => (
                  <PostChip key={p.id} post={p} view="month" draggable={canDragPost(p)} onOpen={onOpen} onDragState={onDragState} />
                ))}
                {dayPosts.length > 2 && <p className="px-1 text-[10px] font-medium text-zinc-400">+{dayPosts.length - 2} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
