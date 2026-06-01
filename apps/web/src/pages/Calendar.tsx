import { useState, useEffect, useMemo, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { postService } from '../services/creative';
import type { Post } from '../services/creative';
import { ChevronLeft, ChevronRight, Plus, X, Calendar as CalIcon, Clock, Trash2 } from 'lucide-react';

type PostStatus = 'published' | 'scheduled' | 'draft' | 'failed';

interface CalendarPost {
  id: string;
  title: string;
  platforms: string[];
  time: string;
  status: PostStatus;
  _date: Date;
  _raw: Post;
}

const STATUS_STYLES: Record<PostStatus, string> = {
  published: 'bg-green-100 text-green-700',
  scheduled: 'bg-yellow-100 text-yellow-700',
  draft: 'bg-gray-100 text-gray-500',
  failed: 'bg-red-100 text-red-600',
};

const STATUS_DOT: Record<PostStatus, string> = {
  published: 'bg-green-500',
  scheduled: 'bg-yellow-400',
  draft: 'bg-gray-300',
  failed: 'bg-red-500',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Major Indian festivals — month is 0-indexed
const FESTIVALS: { year: number; month: number; day: number; name: string; emoji: string }[] = [
  { year: 2025, month: 0, day: 26, name: 'Republic Day', emoji: '🇮🇳' },
  { year: 2025, month: 2, day: 14, name: 'Holi', emoji: '🎨' },
  { year: 2025, month: 3, day: 14, name: 'Baisakhi', emoji: '🌾' },
  { year: 2025, month: 3, day: 18, name: 'Eid al-Fitr', emoji: '🌙' },
  { year: 2025, month: 3, day: 29, name: 'Akshaya Tritiya', emoji: '✨' },
  { year: 2025, month: 5, day: 7, name: 'Eid al-Adha', emoji: '🌙' },
  { year: 2025, month: 7, day: 15, name: 'Independence Day', emoji: '🇮🇳' },
  { year: 2025, month: 8, day: 2, name: 'Ganesh Chaturthi', emoji: '🐘' },
  { year: 2025, month: 9, day: 2, name: 'Gandhi Jayanti', emoji: '🕊️' },
  { year: 2025, month: 9, day: 2, name: 'Dussehra', emoji: '🎯' },
  { year: 2025, month: 9, day: 20, name: 'Dhanteras', emoji: '🪙' },
  { year: 2025, month: 9, day: 21, name: 'Diwali', emoji: '🪔' },
  { year: 2025, month: 11, day: 25, name: 'Christmas', emoji: '🎄' },
  { year: 2025, month: 11, day: 31, name: 'New Year Eve', emoji: '🎊' },
  { year: 2026, month: 0, day: 1, name: 'New Year', emoji: '🎉' },
  { year: 2026, month: 0, day: 14, name: 'Makar Sankranti', emoji: '🪁' },
  { year: 2026, month: 0, day: 26, name: 'Republic Day', emoji: '🇮🇳' },
  { year: 2026, month: 1, day: 26, name: 'Maha Shivratri', emoji: '🔱' },
  { year: 2026, month: 2, day: 4, name: 'Holi', emoji: '🎨' },
  { year: 2026, month: 2, day: 20, name: 'Eid al-Fitr', emoji: '🌙' },
  { year: 2026, month: 3, day: 14, name: 'Baisakhi', emoji: '🌾' },
  { year: 2026, month: 3, day: 28, name: 'Akshaya Tritiya', emoji: '✨' },
  { year: 2026, month: 4, day: 12, name: 'Buddha Purnima', emoji: '☮️' },
  { year: 2026, month: 7, day: 9, name: 'Raksha Bandhan', emoji: '🧡' },
  { year: 2026, month: 7, day: 15, name: 'Independence Day', emoji: '🇮🇳' },
  { year: 2026, month: 7, day: 16, name: 'Janmashtami', emoji: '🪈' },
  { year: 2026, month: 9, day: 2, name: 'Gandhi Jayanti', emoji: '🕊️' },
  { year: 2026, month: 9, day: 9, name: 'Dussehra', emoji: '🎯' },
  { year: 2026, month: 9, day: 20, name: 'Dhanteras', emoji: '🪙' },
  { year: 2026, month: 9, day: 21, name: 'Diwali', emoji: '🪔' },
  { year: 2026, month: 11, day: 25, name: 'Christmas', emoji: '🎄' },
  { year: 2026, month: 11, day: 31, name: 'New Year Eve', emoji: '🎊' },
];

function getFestivalsForDate(date: Date) {
  return FESTIVALS.filter(
    (f) => f.year === date.getFullYear() && f.month === date.getMonth() && f.day === date.getDate(),
  );
}

function PlatformBadge({ label }: { label: string }) {
  const colors: Record<string, string> = {
    FB: 'bg-blue-100 text-blue-700',
    IG: 'bg-pink-100 text-pink-700',
    GMB: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${colors[label] ?? 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  );
}



interface PostDetailModalProps {
  post: CalendarPost;
  onClose: () => void;
  onCancel: (id: string) => void;
  onReschedule: (id: string, newTime: string) => void;
}

function PostDetailModal({ post, onClose, onCancel, onReschedule }: PostDetailModalProps) {
  const now = new Date();
  const minDateTime = now.toISOString().slice(0, 16);
  const toLocal = (d: Date) => {
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
  };
  const [newTime, setNewTime] = useState(toLocal(post._date));
  const [loading, setLoading] = useState(false);

  const quickPicks = [
    { label: 'Tomorrow 9 AM', value: (() => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; })() },
    { label: 'Tomorrow 12 PM', value: (() => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return d; })() },
    { label: 'Tomorrow 6 PM', value: (() => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d; })() },
  ];

  const canReschedule = post.status === 'scheduled' || post.status === 'draft';
  const canCancel = post.status === 'scheduled' || post.status === 'draft';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[post.status]}`}>
              {post.status}
            </span>
            <h3 className="font-bold text-gray-900 mt-1.5 text-sm leading-snug">{post.title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <CalIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{post._date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {post.platforms.map((p) => <PlatformBadge key={p} label={p} />)}
        </div>

        {canReschedule && (
          <div className="space-y-2.5 pt-1 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Reschedule</p>
            <div className="flex flex-wrap gap-1.5">
              {quickPicks.map((q) => (
                <button
                  key={q.label}
                  onClick={() => setNewTime(toLocal(q.value))}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    newTime === toLocal(q.value)
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-gray-50 text-gray-700 border-slate-200 hover:border-orange-300 hover:text-orange-600'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              min={minDateTime}
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-orange-400 focus:outline-none bg-white text-slate-850"
            />
            <button
              disabled={loading || !newTime}
              onClick={async () => {
                setLoading(true);
                try { await onReschedule(post.id, new Date(newTime).toISOString()); onClose(); }
                finally { setLoading(false); }
              }}
              className="w-full py-2 text-sm font-bold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/10"
            >
              <Clock className="w-3.5 h-3.5" />
              {loading ? 'Rescheduling…' : 'Confirm Reschedule'}
            </button>
          </div>
        )}

        {canCancel && (
          <button
            disabled={loading}
            onClick={async () => {
              if (!confirm('Cancel this scheduled post?')) return;
              setLoading(true);
              try { await onCancel(post.id); onClose(); }
              finally { setLoading(false); }
            }}
            className="w-full py-2 text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Cancel Post
          </button>
        )}

        {post.status === 'published' && (
          <p className="text-center text-xs text-gray-400">
            Published — no actions available
          </p>
        )}
      </div>
    </div>
  );
}

// Helper to format week date range like: 25 - 31 May 2026 or 28 May - 3 Jun 2026
function formatWeekRange(dates: Date[]) {
  if (dates.length < 7) return '';
  const start = dates[0]!;
  const end = dates[6]!;
  
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const startMonth = MONTHS[start.getMonth()];
  const endMonth = MONTHS[end.getMonth()];
  
  if (startYear !== endYear) {
    const sMonthAbbr = startMonth.slice(0, 3);
    const eMonthAbbr = endMonth.slice(0, 3);
    return `${start.getDate()} ${sMonthAbbr} ${startYear} - ${end.getDate()} ${eMonthAbbr} ${endYear}`;
  }
  
  if (start.getMonth() !== end.getMonth()) {
    const sMonthAbbr = startMonth.slice(0, 3);
    const eMonthAbbr = endMonth.slice(0, 3);
    return `${start.getDate()} ${sMonthAbbr} - ${end.getDate()} ${eMonthAbbr} ${startYear}`;
  }
  
  return `${start.getDate()} - ${end.getDate()} ${startMonth} ${startYear}`;
}

interface PositionedPost extends CalendarPost {
  top: number;
  height: number;
  left: string;
  width: string;
}

// Overlap resolution layout algorithm for weekly timeline view
function layoutColumnPosts(posts: CalendarPost[]): PositionedPost[] {
  const sorted = [...posts].sort((a, b) => a._date.getTime() - b._date.getTime());
  const positioned: PositionedPost[] = [];
  const hourHeight = 60;
  const cardHeight = 36;
  
  const blocks: PositionedPost[][] = [];
  
  for (const post of sorted) {
    const h = post._date.getHours();
    const m = post._date.getMinutes();
    const top = (h + m / 60) * hourHeight;
    
    const item: PositionedPost = {
      ...post,
      top,
      height: cardHeight,
      left: '4px',
      width: 'calc(100% - 8px)',
    };
    
    let placed = false;
    for (const block of blocks) {
      const overlaps = block.some(b => {
        return item.top < b.top + b.height && b.top < item.top + item.height;
      });
      
      if (overlaps) {
        block.push(item);
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      blocks.push([item]);
    }
  }
  
  for (const block of blocks) {
    const columns: PositionedPost[][] = [];
    
    for (const item of block) {
      let colIdx = 0;
      while (true) {
        if (!columns[colIdx]) {
          columns[colIdx] = [];
        }
        
        const col = columns[colIdx];
        const lastInCol = col[col.length - 1];
        
        if (!lastInCol || !(item.top < lastInCol.top + lastInCol.height && lastInCol.top < item.top + item.height)) {
          col.push(item);
          break;
        }
        
        colIdx++;
      }
    }
    
    const numCols = columns.length;
    for (let c = 0; c < numCols; c++) {
      for (const item of columns[c]) {
        const leftPercent = (c / numCols) * 100;
        const widthPercent = 100 / numCols;
        
        item.left = `calc(${leftPercent}% + 4px)`;
        item.width = `calc(${widthPercent}% - 8px)`;
        positioned.push(item);
      }
    }
  }
  
  return positioned;
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [view, setView] = useState<'week' | 'month'>('week');
  const [apiPosts, setApiPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Real-time time updater for today's timeline marker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const currentTimeOffset = useMemo(() => {
    const h = currentTime.getHours();
    const m = currentTime.getMinutes();
    return (h + m / 60) * 60;
  }, [currentTime]);

  // Scroll to 9 AM or 2 hours before the current hour (whichever is lower) on load/view toggle
  useEffect(() => {
    if (view === 'week' && scrollContainerRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      const targetHour = Math.max(0, Math.min(currentHour - 2, 9));
      scrollContainerRef.current.scrollTop = targetHour * 60;
    }
  }, [view]);

  const weekStart = new Date(today);
  weekStart.setHours(0, 0, 0, 0);
  const day = today.getDay() || 7;
  weekStart.setDate(today.getDate() - day + 1 + weekOffset * 7);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const viewMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);

  const isToday = (d: Date) =>
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();

  const fetchPosts = () => {
    let start: Date, end: Date;
    if (view === 'week') {
      start = new Date(weekStart);
      end = new Date(weekStart);
      end.setDate(end.getDate() + 7);
    } else {
      start = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
      end = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
    }
    postService.getCalendar(start.toISOString(), end.toISOString())
      .then((res) => setApiPosts((res as { data: Post[] }).data ?? []))
      .catch(console.error);
  };

  useEffect(() => { fetchPosts(); }, [weekOffset, monthOffset, view]);

  const mappedPosts: CalendarPost[] = useMemo(() => {
    return apiPosts.map((p) => {
      const d = new Date(p.scheduled_at ?? p.created_at);
      return {
        id: p.id,
        title: p.prompt_text ?? 'Untitled Post',
        platforms: (p.platforms ?? []).map((plat) =>
          plat === 'facebook' ? 'FB' : plat === 'instagram' ? 'IG' : 'GMB',
        ),
        time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        status: p.status as PostStatus,
        _date: d,
        _raw: p,
      };
    });
  }, [apiPosts]);

  const getPostsForDate = (date: Date) =>
    mappedPosts.filter(
      (p) => p._date.getDate() === date.getDate() && p._date.getMonth() === date.getMonth() && p._date.getFullYear() === date.getFullYear(),
    );

  const totalScheduled = mappedPosts.filter((p) => p.status === 'scheduled').length;
  const totalPublished = mappedPosts.filter((p) => p.status === 'published').length;

  const handleCancel = async (id: string) => {
    await postService.delete(id);
    fetchPosts();
  };

  const handleReschedule = async (id: string, scheduled_at: string) => {
    await postService.reschedule(id, scheduled_at);
    fetchPosts();
  };

  // Month grid calculations
  const firstDayOffset = ((viewMonth.getDay() || 7) - 1);
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const monthGridCells = firstDayOffset + daysInMonth;
  const totalCells = Math.ceil(monthGridCells / 7) * 7;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Content Calendar</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalPublished} published · {totalScheduled} scheduled
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm bg-white shadow-sm">
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1.5 font-medium transition-colors cursor-pointer ${view === 'week' ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Week
            </button>
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1.5 font-medium transition-colors cursor-pointer ${view === 'month' ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Month
            </button>
          </div>
          <NavLink to="/create" className="inline-flex items-center gap-1 bg-orange-500 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20">
            <Plus className="w-4 h-4" /> New Post
          </NavLink>
        </div>
      </div>

      {/* Navigation Row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button 
              onClick={() => view === 'week' ? setWeekOffset((o) => o - 1) : setMonthOffset((o) => o - 1)} 
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={() => view === 'week' ? setWeekOffset((o) => o + 1) : setMonthOffset((o) => o + 1)} 
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <span className="text-sm font-semibold text-slate-800">
            {view === 'week' ? formatWeekRange(weekDates) : `${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`}
          </span>
          {((view === 'week' && weekOffset !== 0) || (view === 'month' && monthOffset !== 0)) && (
            <button 
              onClick={() => view === 'week' ? setWeekOffset(0) : setMonthOffset(0)} 
              className="text-xs text-orange-600 hover:text-orange-700 font-bold transition-colors cursor-pointer"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {view === 'week' ? (
        <div className="flex flex-col">
          {/* Week grid header */}
          <div className="grid grid-cols-[60px_1fr_1fr_1fr_1fr_1fr_1fr_1fr] border border-slate-200 bg-white rounded-t-xl py-3 text-center shrink-0 shadow-sm">
            <div />
            {weekDates.map((date, i) => {
              const todayCol = isToday(date);
              const festivals = getFestivalsForDate(date);
              return (
                <div key={i} className="flex flex-col items-center justify-center border-r border-slate-100 last:border-r-0 px-1 min-w-0">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${todayCol ? 'text-orange-500 font-extrabold' : 'text-slate-400'}`}>
                    {DAYS[i]}
                  </span>
                  <span className={`text-lg font-bold mt-0.5 leading-none ${todayCol ? 'text-orange-500 font-extrabold' : 'text-slate-800'}`}>
                    {date.getDate()}
                  </span>
                  {festivals.map((f) => (
                    <span 
                      key={f.name} 
                      className="text-[9px] text-orange-600 font-bold leading-tight truncate max-w-full mt-1 px-1 bg-orange-50 rounded"
                      title={f.name}
                    >
                      {f.emoji} {f.name}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Week grid body timeline */}
          <div 
            ref={scrollContainerRef}
            className="h-[600px] overflow-y-auto border border-slate-200 border-t-0 rounded-b-xl bg-white relative shadow-sm scroll-smooth"
          >
            <div className="relative w-full h-[1440px] flex">
              {/* Hour labels column */}
              <div className="w-[60px] flex-shrink-0 border-r border-slate-100 bg-white z-20">
                {Array.from({ length: 24 }).map((_, h) => {
                  const hourLabel = h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
                  return (
                    <div key={h} className="h-[60px] relative pr-2.5 flex justify-end select-none">
                      <span className="absolute top-0 -translate-y-1/2 text-[9px] font-bold text-slate-400 bg-white px-1 leading-none">
                        {hourLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Day columns + absolute cards */}
              <div className="flex-1 relative h-full grid grid-cols-7 select-none">
                {/* Horizontal hour lines */}
                {Array.from({ length: 24 }).map((_, h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-slate-100 pointer-events-none"
                    style={{ top: `${h * 60}px` }}
                  />
                ))}

                {/* 7 Columns */}
                {weekDates.map((date, i) => {
                  const posts = getPostsForDate(date);
                  const todayCol = isToday(date);
                  
                  // Compute layout for overlapping cards
                  const positionedPosts = layoutColumnPosts(posts);
                  
                  return (
                    <div 
                      key={i} 
                      className={`relative h-full border-r border-slate-100 last:border-r-0 cursor-crosshair hover:bg-slate-50/20 transition-colors ${todayCol ? 'bg-orange-50/10' : ''}`}
                      onClick={(e) => {
                        if (e.target !== e.currentTarget) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const clickY = e.clientY - rect.top;
                        const hourFraction = clickY / 60;
                        const hour = Math.floor(hourFraction);
                        const minsFraction = hourFraction - hour;
                        const roundedMins = minsFraction < 0.25 ? 0 : minsFraction < 0.75 ? 30 : 0;
                        const finalHour = minsFraction >= 0.75 ? Math.min(23, hour + 1) : hour;
                        
                        const timeString = `${String(finalHour).padStart(2, '0')}:${String(roundedMins).padStart(2, '0')}`;
                        const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                        
                        navigate(`/create?date=${dateString}&time=${timeString}`);
                      }}
                      title="Click empty slot to create & schedule a post at this time"
                    >
                      {/* Current Time Line inside today column */}
                      {todayCol && (
                        <div
                          className="absolute left-0 right-0 flex items-center z-25 pointer-events-none"
                          style={{ top: `${currentTimeOffset}px` }}
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-[5px] flex-shrink-0 shadow-sm" />
                          <div className="flex-1 h-0.5 bg-red-500" />
                        </div>
                      )}

                      {/* Render Post Cards */}
                      {positionedPosts.map((post) => (
                        <button
                          key={post.id}
                          onClick={() => setSelectedPost(post)}
                          style={{ 
                            top: `${post.top}px`, 
                            height: `${post.height}px`,
                            left: post.left,
                            width: post.width
                          }}
                          className="absolute rounded-lg border border-slate-200/80 bg-white hover:shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all text-left p-1.5 flex items-center gap-1.5 z-10 group cursor-pointer"
                          title={`${post.title} (${post.time}) — ${post.status}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[post.status]}`} />
                          <span className="text-[10px] font-semibold text-slate-700 leading-none truncate flex-1">
                            {post.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Month view */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/50">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-slate-500 py-3 border-r border-slate-200/60 last:border-r-0">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: totalCells }, (_, i) => {
              const dayNum = i - firstDayOffset;
              const inMonth = dayNum >= 0 && dayNum < daysInMonth;
              const cellDate = inMonth ? new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dayNum + 1) : null;
              const posts = cellDate ? getPostsForDate(cellDate) : [];
              const todayCell = cellDate ? isToday(cellDate) : false;
              return (
                <div
                  key={i}
                  className={`min-h-[90px] p-2 border-r border-b border-slate-200/60 last-of-type:border-r-0 ${
                    !inMonth ? 'bg-slate-50/40 text-slate-300' : todayCell ? 'bg-orange-50/30 border border-orange-200' : 'hover:bg-slate-50/30'
                  }`}
                >
                  {inMonth && cellDate && (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <p className={`text-xs font-bold ${todayCell ? 'text-orange-600' : 'text-slate-700'}`}>{dayNum + 1}</p>
                        <NavLink
                          to={`/create?date=${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`}
                          className="text-slate-400 hover:text-orange-500 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </NavLink>
                      </div>
                      {getFestivalsForDate(cellDate).map((f) => (
                        <p key={f.name} className="text-[8px] text-orange-500 font-bold leading-tight truncate mb-1 bg-orange-50/50 px-0.5 rounded" title={f.name}>
                          {f.emoji} {f.name}
                        </p>
                      ))}
                      <div className="flex flex-wrap gap-1">
                        {posts.slice(0, 3).map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedPost(p)}
                            className={`w-2 h-2 rounded-full ${STATUS_DOT[p.status]} hover:scale-125 transition-transform cursor-pointer`}
                            title={`${p.title} — ${p.status}`}
                          />
                        ))}
                        {posts.length > 3 && (
                          <span className="text-[9px] font-bold text-slate-400">+{posts.length - 3}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Post detail modal */}
      {selectedPost && (
        <PostDetailModal
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onCancel={handleCancel}
          onReschedule={handleReschedule}
        />
      )}
    </div>
  );
}

