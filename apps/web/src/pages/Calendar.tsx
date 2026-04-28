import { useState, useEffect, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
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

function PostCard({ post, onClick }: { post: CalendarPost; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full group rounded-lg border bg-white overflow-hidden hover:shadow-md transition-shadow text-left"
    >
      <div className="p-2 space-y-1">
        <div className="flex items-start justify-between gap-1">
          <p className="text-[11px] font-semibold text-gray-800 leading-tight line-clamp-2 flex-1">{post.title}</p>
          <span className={`w-2 h-2 rounded-full mt-0.5 flex-shrink-0 ${STATUS_DOT[post.status]}`} />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {post.platforms.map((p) => <PlatformBadge key={p} label={p} />)}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">{post.time}</span>
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLES[post.status]}`}>
            {post.status}
          </span>
        </div>
      </div>
    </button>
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
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-600'
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
              className="w-full border border-gray-200 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-blue-400 focus:outline-none"
            />
            <button
              disabled={loading || !newTime}
              onClick={async () => {
                setLoading(true);
                try { await onReschedule(post.id, new Date(newTime).toISOString()); onClose(); }
                finally { setLoading(false); }
              }}
              className="w-full py-2 text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition-colors flex items-center justify-center gap-1.5"
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

export default function CalendarPage() {
  const today = new Date();
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [view, setView] = useState<'week' | 'month'>('week');
  const [apiPosts, setApiPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<CalendarPost | null>(null);

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

  // Month grid: first day of month offset from Mon
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
          <div className="flex rounded-lg border overflow-hidden text-sm">
            <button
              onClick={() => setView('week')}
              className={`px-3 py-1.5 font-medium transition-colors ${view === 'week' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Week
            </button>
            <button
              onClick={() => setView('month')}
              className={`px-3 py-1.5 font-medium transition-colors ${view === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Month
            </button>
          </div>
          <NavLink to="/create" className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Add Post
          </NavLink>
        </div>
      </div>

      {view === 'week' ? (
        <>
          {/* Week navigation */}
          <div className="flex items-center gap-3">
            <button onClick={() => setWeekOffset((o) => o - 1)} className="p-1.5 rounded-lg border hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="text-sm font-medium text-gray-700">
              {weekDates[0]?.getDate()} {MONTHS[weekDates[0]?.getMonth() ?? 0]} — {weekDates[6]?.getDate()} {MONTHS[weekDates[6]?.getMonth() ?? 0]} {weekDates[6]?.getFullYear()}
            </span>
            <button onClick={() => setWeekOffset((o) => o + 1)} className="p-1.5 rounded-lg border hover:bg-gray-50">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                Today
              </button>
            )}
          </div>

          {/* Week grid */}
          <div className="grid grid-cols-7 gap-2">
            {weekDates.map((date, i) => {
              const posts = getPostsForDate(date);
              const todayCol = isToday(date);
              return (
                <div key={i} className={`min-h-[260px] rounded-xl border ${todayCol ? 'border-blue-300 bg-blue-50/50' : 'bg-white border-gray-100'}`}>
                  <div className={`px-2 py-2 text-center border-b ${todayCol ? 'border-blue-200' : 'border-gray-100'}`}>
                    <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{DAYS[i]}</p>
                    <p className={`text-lg font-bold mt-0.5 ${todayCol ? 'text-blue-600' : 'text-gray-800'}`}>
                      {date.getDate()}
                    </p>
                    {getFestivalsForDate(date).map((f) => (
                      <p key={f.name} className="text-[9px] text-orange-600 font-semibold leading-tight truncate" title={f.name}>
                        {f.emoji} {f.name}
                      </p>
                    ))}
                  </div>
                  <div className="p-1.5 space-y-1.5">
                    {posts.map((post) => (
                      <PostCard key={post.id} post={post} onClick={() => setSelectedPost(post)} />
                    ))}
                    <NavLink
                      to={`/create?date=${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`}
                      className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </NavLink>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* Month view */
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="p-4 border-b flex items-center gap-3">
            <button onClick={() => setMonthOffset((o) => o - 1)} className="p-1.5 rounded-lg border hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4 text-gray-600" />
            </button>
            <span className="font-semibold text-gray-800">{MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</span>
            <button onClick={() => setMonthOffset((o) => o + 1)} className="p-1.5 rounded-lg border hover:bg-gray-50">
              <ChevronRight className="w-4 h-4 text-gray-600" />
            </button>
            {monthOffset !== 0 && (
              <button onClick={() => setMonthOffset(0)} className="text-xs text-blue-600 hover:text-blue-700 font-medium ml-1">Today</button>
            )}
          </div>

          <div className="grid grid-cols-7 border-b">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-500 py-2 border-r last:border-r-0">{d}</div>
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
                  className={`min-h-[80px] p-1.5 border-r border-b last-of-type:border-r-0 ${
                    !inMonth ? 'bg-gray-50' : todayCell ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  {inMonth && cellDate && (
                    <>
                      <div className="flex items-center justify-between mb-0.5">
                        <p className={`text-xs font-semibold ${todayCell ? 'text-blue-600' : 'text-gray-700'}`}>{dayNum + 1}</p>
                        <NavLink
                          to={`/create?date=${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`}
                          className="text-gray-300 hover:text-blue-400 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </NavLink>
                      </div>
                      {getFestivalsForDate(cellDate).map((f) => (
                        <p key={f.name} className="text-[8px] text-orange-500 font-bold leading-tight truncate mb-0.5" title={f.name}>
                          {f.emoji} {f.name}
                        </p>
                      ))}
                      <div className="flex flex-wrap gap-0.5">
                        {posts.slice(0, 3).map((p) => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedPost(p)}
                            className={`w-2 h-2 rounded-full ${STATUS_DOT[p.status]} hover:scale-125 transition-transform`}
                            title={`${p.title} — ${p.status}`}
                          />
                        ))}
                        {posts.length > 3 && (
                          <span className="text-[9px] text-gray-400">+{posts.length - 3}</span>
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
