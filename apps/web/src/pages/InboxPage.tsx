import { useState, useEffect, useCallback } from 'react';
import { Search, Send, AlertTriangle, Check, Star, Sparkles, TrendingUp, MessageSquare, ThumbsUp, ChevronDown, ChevronUp, RefreshCw, CheckCheck } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { inboxService, leadService } from '../services/inbox';

type Tag = 'lead' | 'complaint' | 'general' | 'spam';
type Platform = 'facebook' | 'instagram' | 'google';
type Sentiment = 'positive' | 'neutral' | 'negative';

interface Message {
  id: string;
  platform: Platform;
  type: 'comment' | 'dm' | 'review';
  customerName: string;
  customerInitials: string;
  text: string;
  timestamp: string;
  sentiment: Sentiment;
  tag: Tag;
  isRead: boolean;
  postContext?: string;
  suggestedReply: string;
  rating?: number;
}


const PLATFORM_STYLES: Record<Platform, { label: string; color: string; bg: string }> = {
  facebook: { label: 'Facebook', color: 'text-blue-700', bg: 'bg-blue-50' },
  instagram: { label: 'Instagram', color: 'text-pink-700', bg: 'bg-pink-50' },
  google: { label: 'Google Review', color: 'text-green-700', bg: 'bg-green-50' },
};

const TAG_STYLES: Record<Tag, string> = {
  lead: 'bg-green-100 text-green-700',
  complaint: 'bg-red-100 text-red-700',
  general: 'bg-stone-100 text-stone-600',
  spam: 'bg-gray-100 text-gray-500',
};

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'xs' }) {
  const cls = size === 'xs' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`${cls} ${s <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-stone-200 fill-stone-200'}`} />
      ))}
    </div>
  );
}

function ReviewCard({
  msg,
  expanded,
  onToggle,
  onSend,
  onCreateLead,
  onGenerateReply,
  sent,
  leadCreated,
  generatingReply,
}: {
  msg: Message;
  expanded: boolean;
  onToggle: () => void;
  onSend: (id: string, text: string) => void;
  onCreateLead: (id: string) => void;
  onGenerateReply: (id: string) => void;
  sent: boolean;
  leadCreated: boolean;
  generatingReply: boolean;
}) {
  const [editingReply, setEditingReply] = useState(false);
  const [replyText, setReplyText] = useState(msg.suggestedReply);
  const ps = PLATFORM_STYLES[msg.platform];

  return (
    <div className={`bg-white rounded-2xl border transition-all shadow-sm ${
      msg.sentiment === 'negative' ? 'border-red-200' : 'border-stone-200'
    }`}>
      {/* Card header */}
      <div className="flex items-start gap-3 p-5">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {msg.customerInitials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-bold text-stone-900 text-sm">{msg.customerName}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ps.bg} ${ps.color}`}>
              {ps.label}
            </span>
            {msg.tag !== 'general' && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TAG_STYLES[msg.tag]}`}>
                {msg.tag.charAt(0).toUpperCase() + msg.tag.slice(1)}
              </span>
            )}
            {!msg.isRead && (
              <span className="w-2 h-2 bg-orange-500 rounded-full" />
            )}
            <span className="text-[11px] text-stone-400 ml-auto">{msg.timestamp}</span>
          </div>

          {msg.rating !== undefined && (
            <div className="mb-1.5">
              <StarRating rating={msg.rating} />
            </div>
          )}
          <p className="text-sm text-stone-700 leading-relaxed">{msg.text}</p>
          {msg.postContext && (
            <p className="text-xs text-stone-400 mt-1">on "{msg.postContext}"</p>
          )}
        </div>

        <button onClick={onToggle} className="text-stone-400 hover:text-stone-600 transition-colors p-1">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Alerts */}
      {expanded && msg.sentiment === 'negative' && (
        <div className="mx-5 mb-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-700 font-medium">Negative sentiment — review carefully before sending.</p>
        </div>
      )}

      {expanded && msg.tag === 'lead' && !leadCreated && (
        <div className="mx-5 mb-3 flex items-center justify-between bg-green-50 border border-green-200 rounded-xl p-3">
          <p className="text-xs text-green-700 font-semibold">This looks like a sales lead!</p>
          <button
            onClick={() => onCreateLead(msg.id)}
            className="text-xs bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Create Lead
          </button>
        </div>
      )}
      {expanded && leadCreated && (
        <div className="mx-5 mb-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl p-3">
          <Check className="w-4 h-4 text-green-600" />
          <p className="text-xs text-green-700 font-semibold">Lead created successfully</p>
        </div>
      )}

      {/* Generate reply when no AI reply exists */}
      {expanded && !sent && !msg.suggestedReply && msg.tag !== 'spam' && (
        <div className="mx-5 mb-4">
          <button
            onClick={() => onGenerateReply(msg.id)}
            disabled={generatingReply}
            className="flex items-center gap-1.5 text-xs font-bold bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${generatingReply ? 'animate-pulse' : ''}`} />
            {generatingReply ? 'Generating…' : 'Generate AI Reply'}
          </button>
        </div>
      )}

      {/* AI Suggested Reply */}
      {expanded && !sent && msg.tag !== 'spam' && (
        <div className="mx-5 mb-5 space-y-3">
          <div className={`rounded-xl p-4 border ${
            msg.sentiment === 'negative' ? 'bg-red-50 border-red-100' : 'bg-teal-50 border-teal-100'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold flex items-center gap-1.5 ${
                msg.sentiment === 'negative' ? 'text-red-700' : 'text-teal-700'
              }`}>
                <Sparkles className="w-3.5 h-3.5" /> AI Suggested Reply
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-1 ${
                  msg.sentiment === 'negative'
                    ? 'bg-red-100 text-red-600'
                    : 'bg-teal-100 text-teal-600'
                }`}>
                  {msg.sentiment === 'positive' ? 'POSITIVE TONE' : msg.sentiment === 'negative' ? 'RECOVERY TONE' : 'NEUTRAL TONE'}
                </span>
              </span>
              <button
                onClick={() => setEditingReply((v) => !v)}
                className="text-xs text-stone-500 hover:text-stone-800 font-semibold transition-colors"
              >
                {editingReply ? 'Preview' : 'Edit'}
              </button>
            </div>

            {editingReply ? (
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full h-24 text-sm p-3 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none bg-white"
              />
            ) : (
              <p className="text-sm text-stone-700 leading-relaxed">{replyText}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onSend(msg.id, replyText)}
              className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl transition-colors ${
                msg.sentiment === 'negative'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-teal-600 hover:bg-teal-700 text-white'
              }`}
            >
              <Check className="w-3.5 h-3.5" /> Approve &amp; Send
            </button>
            <button
              onClick={() => setEditingReply(true)}
              className="text-xs font-semibold text-stone-600 hover:text-stone-900 px-3 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 transition-colors"
            >
              Edit
            </button>
          </div>
        </div>
      )}

      {expanded && sent && (
        <div className="mx-5 mb-5 flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl p-3">
          <Check className="w-4 h-4 text-teal-600" />
          <p className="text-xs text-teal-700 font-semibold">Reply sent successfully</p>
        </div>
      )}

      {expanded && msg.tag === 'spam' && (
        <div className="mx-5 mb-5 text-center">
          <p className="text-sm text-stone-400 mb-2">Spam messages are hidden from responses.</p>
          <button
            onClick={() => {/* mark not spam */}}
            className="text-xs text-stone-500 hover:text-stone-800 border border-stone-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            Mark as Not Spam
          </button>
        </div>
      )}
    </div>
  );
}

// ─── InboxPage (Reviews Hub) ──────────────────────────────────────────────────
export default function InboxPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | Platform>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [leadCreatedIds, setLeadCreatedIds] = useState<Set<string>>(new Set());
  const [generatingReplyIds, setGeneratingReplyIds] = useState<Set<string>>(new Set());
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const { addToast } = useToast();

  const fetchMessages = useCallback(() => {
    inboxService.list({ pageSize: 50 }).then((res) => {
      const mapped: Message[] = res.items.map((item) => ({
        id: item.id,
        platform: item.platform as Platform,
        type: item.messageType,
        customerName: item.customerName,
        customerInitials: item.customerName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
        text: item.messageText,
        timestamp: new Date(item.receivedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
        sentiment: (item.sentiment ?? 'neutral') as Sentiment,
        tag: (item.tag ?? 'general') as Tag,
        isRead: item.isRead,
        suggestedReply: item.aiSuggestedReply ?? '',
      }));
      setMessages(mapped);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 60_000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const filtered = messages.filter((m) => {
    const matchSearch = !searchQuery
      || m.customerName.toLowerCase().includes(searchQuery.toLowerCase())
      || m.text.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchSearch) return false;
    if (activeFilter === 'all') return true;
    return m.platform === activeFilter;
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (!messages.find((m) => m.id === id)?.isRead) {
        inboxService.markRead(id).catch(() => {});
        setMessages((prev2) => prev2.map((m) => m.id === id ? { ...m, isRead: true } : m));
      }
      return next;
    });
  };

  const handleSend = (id: string, text: string) => {
    inboxService.sendReply(id, text).catch(console.error);
    setSentIds((prev) => new Set(prev).add(id));
  };

  const handleGenerateReply = async (id: string) => {
    setGeneratingReplyIds((prev) => new Set(prev).add(id));
    try {
      const res = await inboxService.generateReply(id);
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, suggestedReply: res.suggestedReply } : m));
    } catch {
      addToast({ type: 'error', title: 'Failed to generate reply', message: 'Please try again.' });
    } finally {
      setGeneratingReplyIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);
    try {
      await inboxService.markAllRead();
      setMessages((prev) => prev.map((m) => ({ ...m, isRead: true })));
      addToast({ type: 'success', title: 'Marked all read' });
    } catch {
      addToast({ type: 'error', title: 'Failed', message: 'Please try again.' });
    } finally {
      setMarkingAllRead(false);
    }
  };

  const handleCreateLead = async (id: string) => {
    const msg = messages.find((m) => m.id === id);
    if (!msg) return;
    try {
      await leadService.create({
        customerName: msg.customerName,
        sourcePlatform: msg.platform as 'facebook' | 'instagram' | 'gmb',
        sourceMessageId: msg.id,
      });
      setLeadCreatedIds((prev) => new Set(prev).add(id));
      addToast({ type: 'success', title: 'Lead created', message: `${msg.customerName} added to your leads.` });
    } catch {
      addToast({ type: 'error', title: 'Failed to create lead', message: 'Please try again.' });
    }
  };

  const pendingCount = messages.filter((m) => !m.isRead).length;
  const repliedCount = messages.length - pendingCount;
  const avgRating = (() => {
    const rated = messages.filter((m) => m.rating !== undefined);
    if (!rated.length) return 0;
    return rated.reduce((s, m) => s + (m.rating ?? 0), 0) / rated.length;
  })();

  const platformCounts: Record<string, number> = { google: 0, facebook: 0, instagram: 0 };
  messages.forEach((m) => { platformCounts[m.platform] = (platformCounts[m.platform] ?? 0) + 1; });

  return (
    <div className="max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">Review &amp; Comment Inbox</h1>
          <p className="text-sm text-stone-500 mt-0.5">All customer feedback across platforms — respond with AI assistance</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reviews..."
              className="pl-9 pr-4 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white w-52"
            />
          </div>
          {pendingCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAllRead}
              className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900 border border-stone-200 rounded-xl px-3 py-2 bg-white hover:bg-stone-50 transition-colors font-medium disabled:opacity-50"
            >
              <CheckCheck className="w-4 h-4" /> Mark All Read
            </button>
          )}
          <button
            onClick={fetchMessages}
            className="flex items-center gap-1.5 text-sm text-stone-600 hover:text-stone-900 border border-stone-200 rounded-xl px-3 py-2 bg-white hover:bg-stone-50 transition-colors font-medium"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Main content */}
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Pending', value: pendingCount, icon: MessageSquare, color: 'text-orange-600', bg: 'bg-orange-50', iconColor: 'text-orange-500' },
              { label: 'Replied', value: repliedCount, icon: Check, color: 'text-teal-600', bg: 'bg-teal-50', iconColor: 'text-teal-500' },
              { label: 'Avg Rating', value: avgRating.toFixed(1), icon: Star, color: 'text-yellow-600', bg: 'bg-yellow-50', iconColor: 'text-yellow-500' },
              { label: 'This Week', value: messages.length, icon: TrendingUp, color: 'text-stone-700', bg: 'bg-stone-100', iconColor: 'text-stone-500' },
            ].map(({ label, value, icon: Icon, color, bg, iconColor }) => (
              <div key={label} className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-stone-500">{label}</p>
                  <div className={`w-7 h-7 ${bg} rounded-xl flex items-center justify-center`}>
                    <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                  </div>
                </div>
                <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Platform filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {([
              { key: 'all', label: `All ${messages.length}` },
              { key: 'google', label: `Google ${platformCounts['google'] ?? 0}` },
              { key: 'facebook', label: `Facebook ${platformCounts['facebook'] ?? 0}` },
              { key: 'instagram', label: `Instagram ${platformCounts['instagram'] ?? 0}` },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors ${
                  activeFilter === key
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                }`}
              >
                {key === 'google' && <span className="text-[10px] font-bold text-[#4285F4]">G</span>}
                {key === 'facebook' && <span className="text-[10px] font-bold text-[#1877F2]">f</span>}
                {key === 'instagram' && <span className="text-[10px] font-bold text-pink-500">Ig</span>}
                {label}
              </button>
            ))}
          </div>

          {/* Review cards */}
          {messages.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-sm">
              <MessageSquare className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-500 font-medium">No messages yet</p>
              <p className="text-stone-400 text-sm mt-1 max-w-sm mx-auto">Connect your Facebook, Instagram, and Google Business Profile in Accounts to receive customer reviews and comments here.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-sm">
              <MessageSquare className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-500 font-medium">No reviews found</p>
              <p className="text-stone-400 text-sm mt-1">Try adjusting your search or filter</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((msg) => (
                <ReviewCard
                  key={msg.id}
                  msg={msg}
                  expanded={expandedIds.has(msg.id)}
                  onToggle={() => toggleExpand(msg.id)}
                  onSend={handleSend}
                  onCreateLead={handleCreateLead}
                  onGenerateReply={handleGenerateReply}
                  sent={sentIds.has(msg.id)}
                  leadCreated={leadCreatedIds.has(msg.id)}
                  generatingReply={generatingReplyIds.has(msg.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Response Stats */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <h3 className="font-bold text-stone-900 mb-4">Response Stats</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs text-stone-500 font-medium mb-0.5">Response Rate</p>
                    <p className="text-2xl font-extrabold text-teal-600">
                      {messages.length > 0 ? Math.round((repliedCount / messages.length) * 100) : 0}%
                    </p>
                    <p className="text-xs text-teal-600 font-semibold">this month</p>
                  </div>
                  <div className="w-8 h-8 bg-teal-50 rounded-xl flex items-center justify-center">
                    <Send className="w-4 h-4 text-teal-500" />
                  </div>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-2">
                  <div
                    className="bg-teal-500 h-2 rounded-full"
                    style={{ width: `${messages.length > 0 ? (repliedCount / messages.length) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-stone-500 font-medium mb-0.5">Avg Response Time</p>
                    <p className="text-2xl font-extrabold text-stone-900">2.4h</p>
                    <p className="text-xs text-stone-400">goal: under 4h</p>
                  </div>
                  <div className="w-8 h-8 bg-yellow-50 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-yellow-500" />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-stone-500 font-medium mb-0.5">Pending Replies</p>
                    <p className="text-2xl font-extrabold text-stone-900">{pendingCount}</p>
                    <p className="text-xs text-orange-600 font-semibold">need attention</p>
                  </div>
                  <div className="w-8 h-8 bg-orange-50 rounded-xl flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-orange-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Platform Breakdown */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <h3 className="font-bold text-stone-900 mb-4">Platform Breakdown</h3>
            <div className="space-y-3">
              {[
                { platform: 'Google Reviews', color: '#4285F4', avg: avgRating.toFixed(1), count: platformCounts['google'] ?? 0, pending: messages.filter((m) => m.platform === 'google' && !m.isRead).length },
                { platform: 'Facebook', color: '#1877F2', avg: null, count: platformCounts['facebook'] ?? 0, pending: messages.filter((m) => m.platform === 'facebook' && !m.isRead).length },
                { platform: 'Instagram', color: '#E1306C', avg: null, count: platformCounts['instagram'] ?? 0, pending: messages.filter((m) => m.platform === 'instagram' && !m.isRead).length },
              ].map(({ platform, color, avg, count, pending }) => (
                <div key={platform} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                      <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-stone-800">{platform}</p>
                      <p className="text-[10px] text-stone-400">
                        {avg ? `${avg} avg · ` : ''}{count} this week
                      </p>
                    </div>
                  </div>
                  {pending > 0 && (
                    <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                      {pending} pending
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <h3 className="font-bold text-stone-900 mb-3.5">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { icon: ThumbsUp, label: 'Reply to all positive reviews', color: 'text-teal-600 bg-teal-50' },
                { icon: AlertTriangle, label: 'Flag unresolved complaints', color: 'text-orange-600 bg-orange-50' },
                { icon: Star, label: 'Request more Google reviews', color: 'text-yellow-600 bg-yellow-50' },
              ].map(({ icon: Icon, label, color }) => (
                <button
                  key={label}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 border border-transparent hover:border-stone-200 transition-colors text-left"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color.split(' ')[1]}`}>
                    <Icon className={`w-3.5 h-3.5 ${color.split(' ')[0]}`} />
                  </div>
                  <span className="text-xs font-semibold text-stone-700">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
