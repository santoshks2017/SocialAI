import { useState } from 'react';
import { Check, Hash, LoaderCircle, Paintbrush, X } from 'lucide-react';
import { cn } from '../ui/Button';
import { addHashtag, limitMessage, type LimitIssue } from '../../utils/createStudio';
import { FIELD_CLASS, LABEL_CLASS } from './fieldStyles';

interface DesignPickerProps {
  creatives: string[];
  selected: number;
  onSelect: (index: number) => void;
  onEditInCanvas: () => void;
}

export function DesignPicker({ creatives, selected, onSelect, onEditInCanvas }: DesignPickerProps) {
  return (
    <div className="pt-3">
      <label className={LABEL_CLASS}>Choose a design</label>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {creatives.map((url, i) => (
          <button
            key={`${url}-${i}`}
            type="button"
            aria-pressed={selected === i}
            aria-label={`Design ${i + 1}`}
            onClick={() => onSelect(i)}
            className={cn('relative rounded-xl overflow-hidden border-2 transition-all', selected === i ? 'border-orange-400 shadow-sm' : 'border-transparent hover:border-zinc-200')}
          >
            <div className="aspect-square bg-zinc-100">
              <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0.3'; }} />
            </div>
            {selected === i && (
              <span className="absolute top-1.5 right-1.5 grid place-items-center w-5 h-5 rounded-full bg-orange-500 text-white">
                <Check className="w-3 h-3" />
              </span>
            )}
          </button>
        ))}
      </div>
      <button type="button" onClick={onEditInCanvas} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700">
        <Paintbrush className="w-3 h-3" /> Edit in Canvas
      </button>
    </div>
  );
}

interface CaptionEditorProps {
  caption: string;
  onCaption: (caption: string) => void;
  hashtags: string[];
  onHashtags: (hashtags: string[]) => void;
  suggesting: boolean;
  onSuggest: () => void;
  issues: LimitIssue[];
  rows: number;
}

export function CaptionEditor({ caption, onCaption, hashtags, onHashtags, suggesting, onSuggest, issues, rows }: CaptionEditorProps) {
  const [draft, setDraft] = useState('');
  return (
    <div>
      <label htmlFor="create-caption" className={LABEL_CLASS}>Caption</label>
      <textarea id="create-caption" value={caption} onChange={(e) => onCaption(e.target.value)} rows={rows} className={FIELD_CLASS} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {hashtags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onHashtags(hashtags.filter((t) => t !== tag))} className="text-zinc-400 hover:text-zinc-700">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            onHashtags(addHashtag(hashtags, draft));
            setDraft('');
          }}
          placeholder="add #tag"
          aria-label="Add a hashtag"
          className="text-xs px-2 py-1 rounded-full border border-zinc-200 w-24 focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <button type="button" onClick={onSuggest} disabled={suggesting} className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700 disabled:opacity-60">
          {suggesting ? <LoaderCircle className="w-3 h-3 animate-spin" /> : <Hash className="w-3 h-3" />} Suggest
        </button>
      </div>
      {issues.map((issue) => (
        <p key={issue.platform} className="text-[11px] text-red-600 mt-1">{limitMessage(issue)}</p>
      ))}
    </div>
  );
}
