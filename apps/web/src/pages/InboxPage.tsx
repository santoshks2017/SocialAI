import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Send, AlertTriangle, Check, Star, Sparkles, TrendingUp, MessageSquare, ThumbsUp,
  ChevronDown, ChevronUp, RefreshCw, CheckCheck, Mail, Sliders, X, Trash2, Edit3, Loader2, ArrowRight
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { inboxService, leadService } from '../services/inbox';
import type { AutoReplyRule, AutoReplyTemplate } from '../services/inbox';

type Tag = 'lead' | 'complaint' | 'general' | 'spam';
type Platform = 'facebook' | 'instagram' | 'google' | 'email';
type Sentiment = 'positive' | 'neutral' | 'negative';

interface Message {
  id: string;
  platform: Platform;
  type: 'comment' | 'dm' | 'review' | 'email';
  customerName: string;
  customerInitials: string;
  text: string;
  timestamp: string;
  sentiment: Sentiment;
  tag: Tag;
  isRead: boolean;
  postContext?: string;
  suggestedReply: string;
  emailSubject?: string;
  rating?: number;
}

const PLATFORM_STYLES: Record<Platform, { label: string; color: string; bg: string }> = {
  facebook: { label: 'Facebook', color: 'text-blue-700', bg: 'bg-blue-50' },
  instagram: { label: 'Instagram', color: 'text-pink-700', bg: 'bg-pink-50' },
  google: { label: 'Google Review', color: 'text-green-700', bg: 'bg-green-50' },
  email: { label: 'Email Inbox', color: 'text-violet-700', bg: 'bg-violet-50' },
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
  onGeneratePostDraft,
  sent,
  leadCreated,
  generatingReply,
  convertingPost,
}: {
  msg: Message;
  expanded: boolean;
  onToggle: () => void;
  onSend: (id: string, text: string) => void;
  onCreateLead: (id: string) => void;
  onGenerateReply: (id: string, tone?: string) => void;
  onGeneratePostDraft: (id: string) => void;
  sent: boolean;
  leadCreated: boolean;
  generatingReply: boolean;
  convertingPost: boolean;
}) {
  const [editingReply, setEditingReply] = useState(false);
  const [replyText, setReplyText] = useState(msg.suggestedReply);
  const ps = PLATFORM_STYLES[msg.platform];

  // Sync suggestion text when msg suggestedReply updates
  useEffect(() => {
    setReplyText(msg.suggestedReply);
  }, [msg.suggestedReply]);

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
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${ps.bg} ${ps.color}`}>
              {msg.platform === 'email' && <Mail className="w-2.5 h-2.5" />}
              {ps.label}
            </span>
            {msg.tag !== 'general' && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TAG_STYLES[msg.tag]}`}>
                {msg.tag.charAt(0).toUpperCase() + msg.tag.slice(1)}
              </span>
            )}
            {!msg.isRead && (
              <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            )}
            <span className="text-[11px] text-stone-400 ml-auto">{msg.timestamp}</span>
          </div>

          {msg.platform === 'email' && msg.emailSubject && (
            <p className="font-semibold text-stone-800 text-sm mb-1">Subject: {msg.emailSubject}</p>
          )}

          {msg.rating !== undefined && (
            <div className="mb-1.5">
              <StarRating rating={msg.rating} />
            </div>
          )}
          <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">{msg.text}</p>
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
            <Sparkles className={`w-3.5 h-3.5 ${generatingReply ? 'animate-spin' : ''}`} />
            {generatingReply ? 'Generating…' : 'Generate AI Reply'}
          </button>
        </div>
      )}

      {/* AI Suggested Reply */}
      {expanded && !sent && msg.suggestedReply && msg.tag !== 'spam' && (
        <div className="mx-5 mb-5 space-y-3">
          <div className={`rounded-xl p-4 border relative ${
            msg.sentiment === 'negative' ? 'bg-red-50 border-red-100' : 'bg-teal-50 border-teal-100'
          }`}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
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

              {/* Tone Selection Dropdown */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-stone-500 font-semibold">Regenerate Tone:</span>
                <select
                  disabled={generatingReply}
                  onChange={(e) => {
                    onGenerateReply(msg.id, e.target.value);
                    e.target.value = ""; // reset
                  }}
                  className="text-[10px] bg-white border border-stone-200 rounded-lg px-2 py-1 text-stone-700 focus:outline-none focus:ring-1 focus:ring-orange-400 cursor-pointer disabled:opacity-50"
                  defaultValue=""
                >
                  <option value="" disabled>Select</option>
                  <option value="friendly">Friendly</option>
                  <option value="professional">Professional</option>
                  <option value="apologetic">Apologetic</option>
                  <option value="casual">Casual</option>
                </select>
              </div>

              <button
                onClick={() => setEditingReply((v) => !v)}
                className="text-xs text-stone-500 hover:text-stone-800 font-semibold transition-colors"
              >
                {editingReply ? 'Preview' : 'Edit'}
              </button>
            </div>

            {generatingReply ? (
              <div className="h-16 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-stone-400 animate-spin" />
              </div>
            ) : editingReply ? (
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                className="w-full h-24 text-sm p-3 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none bg-white"
              />
            ) : (
              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line">{replyText}</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
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

            {msg.sentiment === 'positive' && (
              <button
                onClick={() => onGeneratePostDraft(msg.id)}
                disabled={convertingPost}
                className="flex items-center gap-1.5 text-xs font-bold text-orange-700 hover:text-orange-850 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3.5 py-2 rounded-xl transition-colors disabled:opacity-50 ml-auto"
              >
                {convertingPost ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-orange-500" />}
                Convert to Social Post
              </button>
            )}
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
  const [seedingEmails, setSeedingEmails] = useState(false);
  const { addToast } = useToast();

  // Settings & Configuration states
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configTab, setConfigTab] = useState<'rules' | 'templates'>('rules');

  // Rules CRUD States
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [ruleForm, setRuleForm] = useState<Partial<AutoReplyRule>>({
    platform: 'all',
    message_type: 'all',
    condition_type: 'always',
    condition_value: '',
    action_type: 'ai',
    ai_tone: 'friendly',
    template_id: '',
    is_active: true
  });
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // Templates CRUD States
  const [templates, setTemplates] = useState<AutoReplyTemplate[]>([]);
  const [templateForm, setTemplateForm] = useState({ name: '', text: '' });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const templateTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Post Draft Conversion Preview State
  const [convertingPostId, setConvertingPostId] = useState<string | null>(null);
  const [postDraftPreview, setPostDraftPreview] = useState<{ id: string; caption: string; hashtags: string[]; prompt: string } | null>(null);

  const fetchMessages = useCallback(() => {
    inboxService.list({ pageSize: 50 }).then((res) => {
      const mapped: Message[] = res.items.map((item) => ({
        id: item.id,
        platform: item.platform === 'gmb' ? 'google' : item.platform as Platform,
        type: item.messageType as any,
        customerName: item.customerName,
        customerInitials: item.customerName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
        text: item.messageText,
        timestamp: new Date(item.receivedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }),
        sentiment: (item.sentiment ?? 'neutral') as Sentiment,
        tag: (item.tag ?? 'general') as Tag,
        isRead: item.isRead,
        suggestedReply: item.aiSuggestedReply ?? '',
        emailSubject: item.emailSubject,
      }));
      setMessages(mapped);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchMessages();
    inboxService.getSettings()
      .then((res) => setAutoReplyEnabled(res.autoReplyEnabled))
      .catch(() => {});
  }, [fetchMessages]);

  // Load configuration items when modal is opened
  useEffect(() => {
    if (showConfigModal) {
      inboxService.listRules().then(res => setRules(res.items)).catch(() => {});
      inboxService.listTemplates().then(res => setTemplates(res.items)).catch(() => {});
    }
  }, [showConfigModal]);

  const filtered = messages.filter((m) => {
    const matchSearch = !searchQuery
      || m.customerName.toLowerCase().includes(searchQuery.toLowerCase())
      || m.text.toLowerCase().includes(searchQuery.toLowerCase())
      || (m.emailSubject && m.emailSubject.toLowerCase().includes(searchQuery.toLowerCase()));
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

  const handleGenerateReply = async (id: string, tone?: string) => {
    setGeneratingReplyIds((prev) => new Set(prev).add(id));
    try {
      const res = await inboxService.generateReply(id, tone);
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, suggestedReply: res.suggestedReply } : m));
      addToast({ type: 'success', title: tone ? `${tone.toUpperCase()} tone generated` : 'Suggested reply updated' });
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
        sourcePlatform: msg.platform === 'google' ? 'gmb' : msg.platform,
        sourceMessageId: msg.id,
      });
      setLeadCreatedIds((prev) => new Set(prev).add(id));
      addToast({ type: 'success', title: 'Lead created', message: `${msg.customerName} added to your leads.` });
    } catch {
      addToast({ type: 'error', title: 'Failed to create lead', message: 'Please try again.' });
    }
  };

  // Seed Mock Emails
  const handleSeedMockEmails = async () => {
    setSeedingEmails(true);
    try {
      await inboxService.seedMockEmails();
      fetchMessages();
      addToast({ type: 'success', title: 'Mock Emails Seeded', message: '5 mock customer emails injected.' });
    } catch {
      addToast({ type: 'error', title: 'Failed to seed emails' });
    } finally {
      setSeedingEmails(false);
    }
  };

  // Toggle Auto reply setting
  const handleToggleAutoPilot = async () => {
    const updatedVal = !autoReplyEnabled;
    setAutoReplyEnabled(updatedVal);
    try {
      await inboxService.updateSettings(updatedVal);
      addToast({
        type: 'success',
        title: updatedVal ? '🤖 Auto-Pilot Activated' : '🛠️ Manual Review Mode',
        message: updatedVal ? 'AI will auto-reply according to your rules.' : 'Review AI drafts before sending replies.'
      });
    } catch {
      setAutoReplyEnabled(!updatedVal); // revert
      addToast({ type: 'error', title: 'Failed to update auto-pilot mode' });
    }
  };

  // Rules actions
  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRuleId) {
        await inboxService.updateRule(editingRuleId, ruleForm);
        addToast({ type: 'success', title: 'Rule updated' });
      } else {
        await inboxService.createRule(ruleForm);
        addToast({ type: 'success', title: 'Rule created' });
      }
      inboxService.listRules().then(res => setRules(res.items));
      setEditingRuleId(null);
      setRuleForm({
        platform: 'all',
        message_type: 'all',
        condition_type: 'always',
        condition_value: '',
        action_type: 'ai',
        ai_tone: 'friendly',
        template_id: '',
        is_active: true
      });
    } catch {
      addToast({ type: 'error', title: 'Failed to save rule' });
    }
  };

  const deleteRule = async (id: string) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await inboxService.deleteRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
      addToast({ type: 'success', title: 'Rule deleted' });
    } catch {
      addToast({ type: 'error', title: 'Failed to delete rule' });
    }
  };

  const toggleRuleActive = async (id: string, currentVal: boolean) => {
    try {
      await inboxService.updateRule(id, { is_active: !currentVal });
      setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: !currentVal } : r));
      addToast({ type: 'success', title: !currentVal ? 'Rule activated' : 'Rule deactivated' });
    } catch {
      addToast({ type: 'error', title: 'Failed to toggle rule' });
    }
  };

  // Templates actions
  const saveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.name.trim() || !templateForm.text.trim()) return;
    try {
      if (editingTemplateId) {
        await inboxService.updateTemplate(editingTemplateId, templateForm);
        addToast({ type: 'success', title: 'Template updated' });
      } else {
        await inboxService.createTemplate(templateForm);
        addToast({ type: 'success', title: 'Template created' });
      }
      inboxService.listTemplates().then(res => setTemplates(res.items));
      setEditingTemplateId(null);
      setTemplateForm({ name: '', text: '' });
    } catch {
      addToast({ type: 'error', title: 'Failed to save template' });
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await inboxService.deleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      addToast({ type: 'success', title: 'Template deleted' });
    } catch {
      addToast({ type: 'error', title: 'Failed to delete template' });
    }
  };

  const insertPlaceholder = (ph: string) => {
    const area = templateTextareaRef.current;
    if (!area) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const text = templateForm.text;
    const newText = text.substring(0, start) + ph + text.substring(end);
    setTemplateForm(prev => ({ ...prev, text: newText }));
    setTimeout(() => {
      area.focus();
      area.setSelectionRange(start + ph.length, start + ph.length);
    }, 10);
  };

  // Convert review to social post draft
  const handleGeneratePostDraft = async (id: string) => {
    setConvertingPostId(id);
    try {
      const res = await inboxService.generatePostDraft(id);
      setPostDraftPreview({
        id: res.post.id,
        caption: res.post.caption_text,
        hashtags: res.post.caption_hashtags,
        prompt: res.post.prompt_text,
      });
      addToast({ type: 'success', title: 'Post draft generated', message: 'Review draft details below.' });
    } catch {
      addToast({ type: 'error', title: 'Failed to generate post' });
    } finally {
      setConvertingPostId(null);
    }
  };

  const navigateToPostCreator = () => {
    if (!postDraftPreview) return;
    // Set localStorage state matching CreatePost draft schema
    const draftState = {
      prompt: postDraftPreview.prompt,
      caption: `${postDraftPreview.caption}\n\n${postDraftPreview.hashtags.join(' ')}`,
      selectedPostType: 'delivery',
      selectedPlatforms: ['facebook', 'instagram'],
      toneActive: 'english' as const,
      mediaTab: 'ai' as const
    };
    localStorage.setItem('sg_create_draft', JSON.stringify(draftState));
    window.location.href = `/posts/create?postType=delivery`;
  };

  const pendingCount = messages.filter((m) => !m.isRead).length;
  const repliedCount = messages.length - pendingCount;
  const avgRating = (() => {
    const rated = messages.filter((m) => m.rating !== undefined);
    if (!rated.length) return 0;
    return rated.reduce((s, m) => s + (m.rating ?? 0), 0) / rated.length;
  })();

  const platformCounts: Record<string, number> = { google: 0, facebook: 0, instagram: 0, email: 0 };
  messages.forEach((m) => { platformCounts[m.platform] = (platformCounts[m.platform] ?? 0) + 1; });

  return (
    <div className="max-w-[1200px] mx-auto pb-12">
      {/* Top Bar with Auto Mode Switch */}
      <div className="bg-white border border-stone-200 rounded-3xl p-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900 flex items-center gap-2">
            Unified Social &amp; Mail Inbox
          </h1>
          <p className="text-sm text-stone-500 mt-0.5">Managing Facebook, Instagram, Google Business, &amp; Email communications under one AI assistant.</p>
        </div>

        {/* Global Auto Pilot Config Toggle */}
        <div className="flex items-center gap-4 flex-wrap bg-stone-50 border border-stone-100 rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <span className={`relative flex h-3 w-3 ${autoReplyEnabled ? 'block' : 'hidden'}`}>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            {!autoReplyEnabled && (
              <span className="h-3 w-3 rounded-full bg-amber-500" />
            )}
            <span className="text-xs font-bold text-stone-700">
              {autoReplyEnabled ? '🤖 AUTO-PILOT ACTIVE' : '🛠️ MANUAL REVIEW'}
            </span>
          </div>

          <button
            onClick={handleToggleAutoPilot}
            className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all ${
              autoReplyEnabled
                ? 'bg-emerald-600 text-white shadow-md hover:bg-emerald-700'
                : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {autoReplyEnabled ? 'Turn Off Auto-Pilot' : 'Turn On Auto-Pilot'}
          </button>

          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-1.5 text-xs font-bold bg-stone-900 text-white px-4 py-2 rounded-xl hover:bg-stone-800 transition-colors shadow-sm"
          >
            <Sliders className="w-3.5 h-3.5" /> Configure Rules
          </button>
        </div>
      </div>

      {/* Header controls (search & seed) */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div />
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="pl-9 pr-4 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white w-56"
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
              { label: 'Total Volume', value: messages.length, icon: TrendingUp, color: 'text-stone-700', bg: 'bg-stone-100', iconColor: 'text-stone-500' },
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
              { key: 'email', label: `Email ${platformCounts['email'] ?? 0}` },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors ${
                  activeFilter === key
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-650 border-stone-200 hover:bg-stone-50'
                }`}
              >
                {key === 'google' && <span className="text-[10px] font-bold text-[#4285F4]">G</span>}
                {key === 'facebook' && <span className="text-[10px] font-bold text-[#1877F2]">F</span>}
                {key === 'instagram' && <span className="text-[10px] font-bold text-pink-500">IG</span>}
                {key === 'email' && <Mail className="w-3.5 h-3.5 text-violet-500" />}
                {label}
              </button>
            ))}
          </div>

          {/* Review cards */}
          {messages.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-sm">
              <MessageSquare className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-500 font-medium">No messages yet</p>
              <p className="text-stone-400 text-sm mt-1 max-w-sm mx-auto">Connect your Facebook, Instagram, Google Business Profile, or seed mock emails to test the rules engine.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center shadow-sm">
              <MessageSquare className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-stone-500 font-medium">No reviews found</p>
              <p className="text-stone-400 text-sm mt-1">Try adjusting your search or platform filter</p>
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
                  onGeneratePostDraft={handleGeneratePostDraft}
                  sent={sentIds.has(msg.id)}
                  leadCreated={leadCreatedIds.has(msg.id)}
                  generatingReply={generatingReplyIds.has(msg.id)}
                  convertingPost={convertingPostId === msg.id}
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
                    <p className="text-xs text-teal-605 font-semibold">this month</p>
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
                { platform: 'Emails', color: '#8B5CF6', avg: null, count: platformCounts['email'] ?? 0, pending: messages.filter((m) => m.platform === 'email' && !m.isRead).length },
              ].map(({ platform, color, avg, count, pending }) => (
                <div key={platform} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                      <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-stone-800">{platform}</p>
                      <p className="text-[10px] text-stone-400">
                        {avg && avg !== '0.0' ? `${avg} avg · ` : ''}{count} this week
                      </p>
                    </div>
                  </div>
                  {pending > 0 && (
                    <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                      {pending}
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
              <button
                onClick={handleSeedMockEmails}
                disabled={seedingEmails}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-stone-50 border border-transparent hover:border-stone-200 transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-purple-600 bg-purple-50">
                  {seedingEmails ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                </div>
                <span className="text-xs font-semibold text-stone-700">Seed Mock Emails</span>
              </button>

              {[
                { icon: ThumbsUp, label: 'Reply to positive reviews', color: 'text-teal-600 bg-teal-50' },
                { icon: AlertTriangle, label: 'Flag resolved complaints', color: 'text-orange-600 bg-orange-50' },
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

      {/* ─── Rules & Templates Configuration Modal ─── */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all">
          <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-extrabold text-stone-900 flex items-center gap-2">
                  🤖 Auto-Response Configuration
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">Configure conditions, AI tones, and canned template reply sets.</p>
              </div>
              <button
                onClick={() => {
                  setShowConfigModal(false);
                  setEditingRuleId(null);
                  setEditingTemplateId(null);
                }}
                className="text-stone-400 hover:text-stone-600 border border-stone-200 p-1.5 rounded-xl hover:bg-stone-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="px-6 border-b border-stone-100 flex gap-4 bg-stone-50/50">
              <button
                onClick={() => setConfigTab('rules')}
                className={`py-3.5 text-sm font-bold border-b-2 transition-all ${
                  configTab === 'rules'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                Rules Builder
              </button>
              <button
                onClick={() => setConfigTab('templates')}
                className={`py-3.5 text-sm font-bold border-b-2 transition-all ${
                  configTab === 'templates'
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                Canned Template Sets
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {configTab === 'rules' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  {/* Rules Builder Form */}
                  <form onSubmit={saveRule} className="space-y-4 bg-stone-50 p-5 border border-stone-200/60 rounded-2xl">
                    <h3 className="font-bold text-stone-900 text-sm">
                      {editingRuleId ? '✏️ Edit Match Rule' : '➕ Create New Match Rule'}
                    </h3>

                    {/* Platform Selector */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Source Platform</label>
                      <select
                        value={ruleForm.platform}
                        onChange={(e) => setRuleForm(prev => ({ ...prev, platform: e.target.value }))}
                        className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                      >
                        <option value="all">All Platforms</option>
                        <option value="facebook">Facebook</option>
                        <option value="instagram">Instagram</option>
                        <option value="gmb">Google Business</option>
                        <option value="email">Email</option>
                      </select>
                    </div>

                    {/* Message Type Selector */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Message Type</label>
                      <select
                        value={ruleForm.message_type}
                        onChange={(e) => setRuleForm(prev => ({ ...prev, message_type: e.target.value }))}
                        className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                      >
                        <option value="all">All Types</option>
                        <option value="comment">Comments</option>
                        <option value="dm">Direct Messages / DMs</option>
                        <option value="review">Reviews</option>
                        <option value="email">Emails</option>
                      </select>
                    </div>

                    {/* Trigger Condition Selector */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Trigger Condition</label>
                      <select
                        value={ruleForm.condition_type}
                        onChange={(e) => setRuleForm(prev => ({ ...prev, condition_type: e.target.value }))}
                        className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                      >
                        <option value="always">Always Match</option>
                        <option value="sentiment_is">Sentiment is...</option>
                        <option value="rating_is">Rating matches...</option>
                        <option value="contains_keywords">Contains Keywords...</option>
                      </select>
                    </div>

                    {/* Condition Value Input */}
                    {ruleForm.condition_type !== 'always' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                          {ruleForm.condition_type === 'sentiment_is' && 'Sentiment Value (positive, negative, neutral)'}
                          {ruleForm.condition_type === 'rating_is' && 'Star Ratings (comma separated, e.g. 1,2)'}
                          {ruleForm.condition_type === 'contains_keywords' && 'Keywords (comma separated, e.g. price, booking)'}
                        </label>
                        <input
                          type="text"
                          required
                          value={ruleForm.condition_value ?? ''}
                          onChange={(e) => setRuleForm(prev => ({ ...prev, condition_value: e.target.value }))}
                          placeholder={
                            ruleForm.condition_type === 'sentiment_is' ? 'positive' :
                            ruleForm.condition_type === 'rating_is' ? '1,2' : 'price,discount,hours'
                          }
                          className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                        />
                      </div>
                    )}

                    {/* Action Selector */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reply Action</label>
                      <select
                        value={ruleForm.action_type}
                        onChange={(e) => setRuleForm(prev => ({ ...prev, action_type: e.target.value }))}
                        className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                      >
                        <option value="ai">AI Auto-Reply</option>
                        <option value="template">Canned Template Reply</option>
                        <option value="manual">Manual Review (Do not auto-reply)</option>
                      </select>
                    </div>

                    {/* AI Tone Selector */}
                    {ruleForm.action_type === 'ai' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">AI Tone Preset</label>
                        <select
                          value={ruleForm.ai_tone ?? 'friendly'}
                          onChange={(e) => setRuleForm(prev => ({ ...prev, ai_tone: e.target.value }))}
                          className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                        >
                          <option value="friendly">Friendly &amp; Warm</option>
                          <option value="professional">Professional &amp; Informative</option>
                          <option value="apologetic">Apologetic &amp; Recovery</option>
                          <option value="casual">Casual &amp; Chatty</option>
                        </select>
                      </div>
                    )}

                    {/* Template Selector */}
                    {ruleForm.action_type === 'template' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Choose Template Set</label>
                        <select
                          required
                          value={ruleForm.template_id ?? ''}
                          onChange={(e) => setRuleForm(prev => ({ ...prev, template_id: e.target.value }))}
                          className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                        >
                          <option value="" disabled>-- Select a template --</option>
                          {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        className="flex-1 py-2 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-xl transition-colors shadow-sm"
                      >
                        {editingRuleId ? 'Save Updates' : 'Add Active Rule'}
                      </button>
                      {editingRuleId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRuleId(null);
                            setRuleForm({
                              platform: 'all',
                              message_type: 'all',
                              condition_type: 'always',
                              condition_value: '',
                              action_type: 'ai',
                              ai_tone: 'friendly',
                              template_id: '',
                              is_active: true
                            });
                          }}
                          className="px-4 py-2 text-xs font-bold text-stone-500 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Rules list */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-stone-900 text-sm flex items-center justify-between">
                      Active Rules Checklist
                      <span className="text-xs text-stone-400 font-normal">First matching rule triggers</span>
                    </h3>

                    {rules.length === 0 ? (
                      <p className="text-stone-400 text-xs text-center py-10">No active rules configured. AI default auto-reply will handle all incoming requests.</p>
                    ) : (
                      <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                        {rules.map((rule) => (
                          <div key={rule.id} className={`border p-4 rounded-2xl bg-white shadow-sm flex items-start justify-between gap-3 ${!rule.is_active && 'opacity-60'}`}>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-stone-100 text-stone-600">
                                  {rule.platform}
                                </span>
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-stone-100 text-stone-600">
                                  {rule.message_type}
                                </span>
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                  rule.action_type === 'ai' ? 'bg-teal-50 text-teal-700' :
                                  rule.action_type === 'template' ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {rule.action_type === 'ai' ? `AI (${rule.ai_tone})` :
                                   rule.action_type === 'template' ? `Template (${rule.template?.name || 'Deleted'})` : 'Manual'}
                                </span>
                              </div>

                              <p className="text-xs font-semibold text-stone-800">
                                Trigger: {rule.condition_type.replace('_', ' ')}
                                {rule.condition_value && ` = "${rule.condition_value}"`}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => toggleRuleActive(rule.id, rule.is_active)}
                                className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                                  rule.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-stone-50 text-stone-400 border-stone-200'
                                }`}
                              >
                                {rule.is_active ? 'Active' : 'Disabled'}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingRuleId(rule.id);
                                  setRuleForm({
                                    platform: rule.platform,
                                    message_type: rule.message_type,
                                    condition_type: rule.condition_type,
                                    condition_value: rule.condition_value ?? '',
                                    action_type: rule.action_type,
                                    ai_tone: rule.ai_tone,
                                    template_id: rule.template_id ?? '',
                                    is_active: rule.is_active
                                  });
                                }}
                                className="text-stone-400 hover:text-stone-600 border border-stone-200 p-1.5 rounded-lg hover:bg-stone-50 transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteRule(rule.id)}
                                className="text-stone-400 hover:text-red-600 border border-stone-200 p-1.5 rounded-lg hover:bg-red-50 hover:border-red-100 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6 items-start">
                  {/* Template Builder Form */}
                  <form onSubmit={saveTemplate} className="space-y-4 bg-slate-50 p-5 border border-stone-200/60 rounded-2xl">
                    <h3 className="font-bold text-stone-900 text-sm">
                      {editingTemplateId ? '✏️ Edit Template' : '➕ Create Template Set'}
                    </h3>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Template Name</label>
                      <input
                        type="text"
                        required
                        value={templateForm.name}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="e.g., Price Quote Auto Response"
                        className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase">Response Text</label>
                        <span className="text-[10px] text-stone-400">Placeholders render automatically</span>
                      </div>
                      <textarea
                        ref={templateTextareaRef}
                        required
                        value={templateForm.text}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, text: e.target.value }))}
                        rows={6}
                        placeholder="Hi {{customer_name}}, thank you for your request. Our showroom in {{city}} is open..."
                        className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                      />
                    </div>

                    {/* Placeholder Insertion Chips */}
                    <div>
                      <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Insert Placeholders</label>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { val: '{{customer_name}}', label: 'Customer' },
                          { val: '{{dealer_name}}', label: 'Dealer' },
                          { val: '{{phone}}', label: 'Phone' },
                          { val: '{{whatsapp}}', label: 'WhatsApp' },
                          { val: '{{city}}', label: 'City' },
                          { val: '{{email_subject}}', label: 'Mail Subject' }
                        ].map(chip => (
                          <button
                            key={chip.val}
                            type="button"
                            onClick={() => insertPlaceholder(chip.val)}
                            className="text-[10px] font-semibold bg-white border border-stone-200 hover:border-orange-400 text-stone-600 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                          >
                            + {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        className="flex-1 py-2 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-xl transition-colors shadow-sm"
                      >
                        {editingTemplateId ? 'Save Changes' : 'Create Template'}
                      </button>
                      {editingTemplateId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTemplateId(null);
                            setTemplateForm({ name: '', text: '' });
                          }}
                          className="px-4 py-2 text-xs font-bold text-stone-500 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Templates List */}
                  <div className="space-y-3">
                    <h3 className="font-bold text-stone-900 text-sm">Response Template Sets</h3>
                    {templates.length === 0 ? (
                      <p className="text-stone-400 text-xs text-center py-12 bg-stone-50 rounded-2xl border border-dashed border-stone-200">No template sets created yet. Add one on the left.</p>
                    ) : (
                      <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                        {templates.map(temp => (
                          <div key={temp.id} className="border border-stone-200 p-4 rounded-2xl bg-white shadow-sm flex flex-col justify-between gap-3">
                            <div className="flex items-start justify-between gap-2 border-b border-stone-100 pb-2">
                              <h4 className="font-bold text-stone-900 text-sm">{temp.name}</h4>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => {
                                    setEditingTemplateId(temp.id);
                                    setTemplateForm({ name: temp.name, text: temp.text });
                                  }}
                                  className="text-stone-400 hover:text-stone-600 border border-stone-200 p-1.5 rounded-lg hover:bg-stone-50 transition-colors"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteTemplate(temp.id)}
                                  className="text-stone-400 hover:text-red-600 border border-stone-200 p-1.5 rounded-lg hover:bg-red-50 hover:border-red-100 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-wrap font-mono bg-stone-50/50 p-2.5 rounded-xl border border-stone-100">
                              {temp.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Convert Positive feedback to Social Post Preview Modal ─── */}
      {postDraftPreview && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setPostDraftPreview(null)}
              className="text-stone-400 hover:text-stone-600 border border-stone-200 p-1.5 rounded-xl absolute top-6 right-6 hover:bg-stone-50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-extrabold text-stone-900">
                AI Testimonial Post Draft Ready!
              </h2>
            </div>

            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              We parsed the positive review details and compiled a social media post variant optimized for Facebook and Instagram. Link below to edit in the Canvas Studio.
            </p>

            <div className="border border-stone-200 rounded-2xl bg-stone-50 p-4 space-y-3 mb-6">
              <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wide">Testimonial Caption Draft</span>
              </div>
              <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-line font-medium">
                {postDraftPreview.caption}
              </p>
              <p className="text-xs text-orange-600 font-bold">
                {postDraftPreview.hashtags.join(' ')}
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPostDraftPreview(null)}
                className="px-4 py-2.5 text-xs font-bold text-stone-600 hover:text-stone-850 hover:bg-stone-50 border border-stone-200 rounded-xl transition-colors"
              >
                Close Preview
              </button>
              <button
                onClick={navigateToPostCreator}
                className="px-5 py-2.5 text-xs font-bold bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl transition-all shadow-md flex items-center gap-1.5"
              >
                Go to Canvas Editor <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
