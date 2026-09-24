import { useState } from 'react';
import { ChevronDown, CircleCheck, LoaderCircle, Megaphone, PenLine, Send, Sparkles, UserPlus } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import { selectDraftOption, toneLabel, type DraftState, type InboxTag, type Sentiment } from '../../utils/inbox';

const TEXTAREA = 'w-full h-24 text-sm p-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none bg-white';
// Send buttons are teal (red for a negative message), not the orange primary.
const SEND = 'inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-white shadow-sm transition-colors h-8 px-3 disabled:opacity-50 disabled:pointer-events-none';
const SMALL = 'h-8 px-3 text-xs';

interface AiSuggestionPanelProps {
  sentiment: Sentiment;
  draft: DraftState;
  generating: boolean;
  sending: boolean;
  onChange: (draft: DraftState) => void;
  onRegenerate: () => void;
  onSend: (text: string) => void;
}

export function AiSuggestionPanel({ sentiment, draft, generating, sending, onChange, onRegenerate, onSend }: AiSuggestionPanelProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const negative = sentiment === 'negative';
  const link = cn('text-[11px] font-semibold transition-colors disabled:opacity-50', negative ? 'text-red-600 hover:text-red-800' : 'text-teal-600 hover:text-teal-800');

  return (
    <div className={cn('rounded-xl p-4 border', negative ? 'bg-red-50 border-red-100' : 'bg-teal-50 border-teal-100')}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className={cn('text-xs font-bold flex items-center gap-1.5', negative ? 'text-red-700' : 'text-teal-700')}>
          <Sparkles className="w-3.5 h-3.5" />
          AI Suggested Reply
          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full ml-1', negative ? 'bg-red-100 text-red-600' : 'bg-teal-100 text-teal-600')}>
            {toneLabel(sentiment)}
          </span>
        </p>
        <div className="flex items-center gap-3">
          <button type="button" className={link} onClick={onRegenerate} disabled={generating}>
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button type="button" className={link} onClick={() => onChange({ ...draft, editing: !draft.editing })}>
            {draft.editing ? 'Preview' : 'Edit'}
          </button>
        </div>
      </div>

      {draft.options.length > 1 && (
        <div className="relative mb-2">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((o) => !o)}
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border bg-white transition-colors',
              negative ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-teal-200 text-teal-700 hover:bg-teal-50',
            )}
          >
            Option {draft.index + 1} of {draft.options.length}
            <ChevronDown className={cn('w-3 h-3 transition-transform', pickerOpen && 'rotate-180')} />
          </button>
          {pickerOpen && (
            <div role="listbox" className="absolute left-0 z-20 mt-1 w-72 max-w-full bg-white rounded-xl border border-zinc-200 shadow-lg py-1">
              {draft.options.map((option, i) => (
                <button
                  key={i}
                  type="button"
                  role="option"
                  aria-selected={i === draft.index}
                  onClick={() => { onChange(selectDraftOption(draft, i)); setPickerOpen(false); }}
                  className={cn('w-full text-left px-3 py-2 transition-colors', i === draft.index ? 'bg-zinc-50' : 'hover:bg-zinc-50')}
                >
                  <span className="block text-[11px] font-semibold text-zinc-800">Option {i + 1}</span>
                  <span className="block text-xs text-zinc-500 truncate">{option}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {draft.editing ? (
        <textarea className={TEXTAREA} value={draft.text} aria-label="Reply" onChange={(e) => onChange({ ...draft, text: e.target.value })} />
      ) : (
        <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">{draft.text}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button
          type="button"
          disabled={sending || !draft.text.trim()}
          onClick={() => onSend(draft.text)}
          className={cn(SEND, negative ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700')}
        >
          {sending ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {sending ? 'Sending…' : 'Approve & Send'}
        </button>
        {!draft.editing && (
          <Button variant="secondary" className={SMALL} onClick={() => onChange({ ...draft, editing: true })}>Edit</Button>
        )}
      </div>
    </div>
  );
}

interface ManualComposerProps {
  customerName: string;
  text: string;
  generating: boolean;
  sending: boolean;
  onText: (text: string) => void;
  onCancel: () => void;
  onTryAi: () => void;
  onSend: (text: string) => void;
}

export function ManualComposer({ customerName, text, generating, sending, onText, onCancel, onTryAi, onSend }: ManualComposerProps) {
  return (
    <div className="rounded-xl p-4 border border-zinc-200 bg-zinc-50/50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-zinc-700">Your reply</p>
        <button type="button" onClick={onCancel} className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-800 transition-colors">Cancel</button>
      </div>
      <textarea className={TEXTAREA} value={text} placeholder={`Reply to ${customerName}…`} onChange={(e) => onText(e.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
        <button
          type="button"
          onClick={onTryAi}
          disabled={generating}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {generating ? 'Generating…' : 'Try AI instead'}
        </button>
        <button type="button" onClick={() => onSend(text)} disabled={sending || !text.trim()} className={cn(SEND, 'bg-teal-600 hover:bg-teal-700')}>
          {sending ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {sending ? 'Sending…' : 'Send reply'}
        </button>
      </div>
    </div>
  );
}

export function ReplyStarter({ generating, onGenerate, onManual }: { generating: boolean; onGenerate: () => void; onManual: () => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" className={SMALL} onClick={onGenerate} disabled={generating}>
        {generating ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {generating ? 'Generating…' : 'Generate AI Reply'}
      </Button>
      <Button variant="secondary" className={SMALL} onClick={onManual}>
        <PenLine className="w-3.5 h-3.5" />
        Write manually
      </Button>
    </div>
  );
}

export function LeadPrompt({ tag, created, busy, onCreate }: { tag: InboxTag; created: boolean; busy: boolean; onCreate: () => void }) {
  if (created) {
    return (
      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
        <CircleCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
        <p className="text-xs font-medium text-green-700">Lead created successfully</p>
      </div>
    );
  }
  const isLead = tag === 'lead';
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg p-3 border', isLead ? 'bg-green-50 border-green-200' : 'bg-zinc-50 border-zinc-200')}>
      <p className={cn('text-xs font-medium', isLead ? 'text-green-700' : 'text-zinc-600')}>
        {isLead ? 'This looks like a sales lead!' : 'Track this customer as a lead?'}
      </p>
      <Button variant="secondary" className="h-7 px-2.5 text-xs" onClick={onCreate} disabled={busy}>
        {busy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
        {isLead ? 'Create Lead' : 'Mark as lead'}
      </Button>
    </div>
  );
}

// Our extra: a 4–5★ review becomes a thank-you post draft in Create.
export function TurnIntoPostRow({ rating, busy, onClick }: { rating: number; busy: boolean; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg p-3 border border-orange-100 bg-orange-50/50">
      <p className="text-xs font-medium text-zinc-700">Share this {rating}★ review as a post.</p>
      <Button variant="secondary" className="h-7 px-2.5 text-xs" onClick={onClick} disabled={busy}>
        {busy ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Megaphone className="w-3.5 h-3.5" />}
        Turn into post
      </Button>
    </div>
  );
}

export function SpamNotice({ onNotSpam }: { onNotSpam: () => void }) {
  return (
    <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-lg p-3">
      <p className="text-xs text-zinc-500">Spam messages are hidden from responses.</p>
      <button type="button" onClick={onNotSpam} className="text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 transition-colors">Not spam</button>
    </div>
  );
}

export function ReplySent() {
  return (
    <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-lg p-3">
      <CircleCheck className="w-4 h-4 text-teal-600 flex-shrink-0" />
      <p className="text-xs font-medium text-teal-700">Reply sent successfully</p>
    </div>
  );
}
