import { useState } from 'react';
import { ChevronDown, Mail, TriangleAlert } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { canTurnIntoPost, iconPlatform, type DraftState, type InboxItem, type InboxReplyItem } from '../../utils/inbox';
import { SentimentBadge, StarRating, TagBadge } from './Badges';
import { AiSuggestionPanel, LeadPrompt, ManualComposer, ReplySent, ReplyStarter, SpamNotice, TurnIntoPostRow } from './ReplyComposer';

export interface MessageCardProps {
  item: InboxItem;
  expanded: boolean;
  /** reply_inbox: answering, leads and "Turn into post". */
  canReply: boolean;
  draft: DraftState | undefined;
  generating: boolean;
  sending: boolean;
  sent: boolean;
  leadBusy: boolean;
  leadCreated: boolean;
  converting: boolean;
  onToggle: (item: InboxItem) => void;
  onDraftChange: (id: string, draft: DraftState) => void;
  onGenerate: (item: InboxItem) => void;
  onSend: (item: InboxItem, text: string) => void;
  onCreateLead: (item: InboxItem) => void;
  onNotSpam: (item: InboxItem) => void;
  onTurnIntoPost: (item: InboxItem) => void;
}

function PostContextBlock({ item }: { item: InboxItem }) {
  const text = item.postContext ?? 'View original post';
  return (
    <div className="flex items-center gap-2.5 bg-zinc-50 rounded-lg border border-zinc-100 px-3 py-2">
      {item.postThumbnail && <img src={item.postThumbnail} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0 border border-zinc-200" />}
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">In response to</p>
        {item.postExternalUrl ? (
          <a href={item.postExternalUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-xs font-medium text-zinc-700 hover:text-orange-600 transition-colors">
            {text} ↗
          </a>
        ) : (
          <p className="truncate text-xs font-medium text-zinc-700">{text}</p>
        )}
      </div>
    </div>
  );
}

// We store one dealer reply per message; it shows as a thread item without a nested composer.
function ReplyThread({ replies }: { replies: InboxReplyItem[] }) {
  return (
    <div className="space-y-2 pl-3 border-l-2 border-zinc-100">
      {replies.map((r) => (
        <div key={r.id} className="flex items-start gap-2.5">
          <span className="w-7 h-7 rounded-full bg-orange-50 text-orange-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0">You</span>
          <div className="min-w-0">
            <p className="text-xs">
              <span className="font-semibold text-zinc-800">You</span>
              <span className="text-zinc-400"> · dealer</span>
              {r.timestamp && <span className="text-zinc-400 ml-2">{r.timestamp}</span>}
            </p>
            <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap mt-0.5">{r.text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageCard(props: MessageCardProps) {
  const { item, expanded, canReply, draft, generating, sending, sent, leadBusy, leadCreated, converting } = props;
  const [manual, setManual] = useState(false);
  const [manualText, setManualText] = useState('');
  const negative = item.sentiment === 'negative';
  const icon = iconPlatform(item.platform);

  const replyArea = () => {
    if (sent) return <ReplySent />;
    if (item.tag === 'spam') return <SpamNotice onNotSpam={() => props.onNotSpam(item)} />;
    if (item.responded) return null;
    if (draft) {
      return (
        <AiSuggestionPanel
          sentiment={item.sentiment}
          draft={draft}
          generating={generating}
          sending={sending}
          onChange={(next) => props.onDraftChange(item.id, next)}
          onRegenerate={() => props.onGenerate(item)}
          onSend={(text) => props.onSend(item, text)}
        />
      );
    }
    if (manual) {
      return (
        <ManualComposer
          customerName={item.customerName}
          text={manualText}
          generating={generating}
          sending={sending}
          onText={setManualText}
          onCancel={() => setManual(false)}
          onTryAi={() => props.onGenerate(item)}
          onSend={(text) => props.onSend(item, text)}
        />
      );
    }
    return <ReplyStarter generating={generating} onGenerate={() => props.onGenerate(item)} onManual={() => setManual(true)} />;
  };

  return (
    <div
      className={cn(
        'rounded-xl border shadow-sm transition-all duration-200 relative overflow-hidden',
        !item.isRead && 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-orange-500',
        item.isRead ? 'bg-zinc-50/60' : 'bg-white',
        expanded
          ? cn('shadow-md', negative ? 'border-red-200' : 'border-zinc-300')
          : cn('hover:shadow-md', negative ? 'border-red-200/80' : 'border-zinc-200/80 hover:border-zinc-300'),
      )}
    >
      <button type="button" onClick={() => props.onToggle(item)} aria-expanded={expanded} className="w-full text-left flex items-start gap-3 p-4">
        <span className="relative w-9 h-9 rounded-full bg-zinc-100 text-zinc-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
          {item.customerInitials}
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white ring-1 ring-zinc-200 flex items-center justify-center">
            {icon ? <PlatformIcon platform={icon} size="sm" className="w-3 h-3" /> : <Mail className="w-2.5 h-2.5 text-zinc-500" />}
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('text-sm leading-tight', item.isRead ? 'font-medium text-zinc-600' : 'font-bold text-zinc-900')}>{item.customerName}</span>
            {!item.isRead && <span aria-label="Unread" title="Unread" className="w-2 h-2 bg-orange-600 rounded-full flex-shrink-0" />}
            <SentimentBadge sentiment={item.sentiment} />
            <TagBadge tag={item.tag} />
            <span className="ml-auto text-[11px] text-zinc-400 whitespace-nowrap">{item.timestamp}</span>
          </span>
          {item.rating !== undefined && (
            <span className="mt-1 flex"><StarRating rating={item.rating} /></span>
          )}
          {item.text && (
            <span className={cn('mt-1 block text-sm text-zinc-600 leading-relaxed', !expanded && 'line-clamp-2')}>{item.text}</span>
          )}
          {!expanded && item.postContext && (
            <span className="mt-1 block truncate text-[11px] text-zinc-400">on “{item.postContext}”</span>
          )}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-zinc-400 flex-shrink-0 mt-1 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-4 pb-4 pt-3 space-y-3">
          {(item.postContext || item.postThumbnail) && <PostContextBlock item={item} />}
          {negative && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <TriangleAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs font-medium text-red-700">Negative sentiment — review carefully before sending.</p>
            </div>
          )}
          {item.replies.length > 0 && <ReplyThread replies={item.replies} />}
          {canReply && replyArea()}
          {canReply && !sent && item.tag !== 'spam' && (
            <LeadPrompt tag={item.tag} created={leadCreated} busy={leadBusy} onCreate={() => props.onCreateLead(item)} />
          )}
          {canReply && canTurnIntoPost(item) && (
            <TurnIntoPostRow rating={item.rating ?? 0} busy={converting} onClick={() => props.onTurnIntoPost(item)} />
          )}
        </div>
      )}
    </div>
  );
}
