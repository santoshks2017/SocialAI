import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { cn } from '../ui/Button';
import { formatRelativeTime } from '../../utils/helpers';
import { notificationService, type AppNotification } from '../../services/notifications';

const POLL_MS = 60_000;

export function NotificationBell({ align = 'right' }: { align?: 'left' | 'right' }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    notificationService.list(15)
      .then((res) => { setItems(res.items); setUnread(res.unreadCount); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openItem = (n: AppNotification) => {
    if (!n.isRead) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
      notificationService.markRead(n.id).catch(() => {});
    }
    setOpen(false);
    if (n.deepLink) navigate(n.deepLink);
  };

  const markAllRead = () => {
    setItems((list) => list.map((x) => ({ ...x, isRead: true })));
    setUnread(0);
    notificationService.markAllRead().catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-zinc-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-zinc-500" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-orange-600 rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={cn('absolute mt-2 w-80 max-h-[420px] overflow-y-auto bg-white rounded-xl border border-zinc-200 shadow-lg z-50', align === 'left' ? 'left-0' : 'right-0')}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 sticky top-0 bg-white">
            <span className="text-sm font-semibold text-zinc-900">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1">
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">You're all caught up.</p>
          ) : (
            <ul className="divide-y divide-zinc-50">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openItem(n)}
                    className={cn('w-full text-left px-4 py-3 hover:bg-zinc-50 transition-colors flex gap-2.5', !n.isRead && 'bg-orange-50/40')}
                  >
                    {n.isRead
                      ? <span className="w-2 flex-shrink-0" />
                      : <span className="mt-1.5 w-2 h-2 rounded-full bg-orange-600 flex-shrink-0" />}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-zinc-900 truncate">{n.title}</span>
                      {n.body && <span className="block text-xs text-zinc-500 line-clamp-2">{n.body}</span>}
                      <span className="block text-[11px] text-zinc-400 mt-0.5">{formatRelativeTime(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
