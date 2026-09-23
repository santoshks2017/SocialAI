import { useRef, type ReactNode } from 'react';
import { Check, Film, Image as ImageIcon, Info, LoaderCircle, Upload, Wand2, X } from 'lucide-react';
import { cn } from '../ui/Button';
import { PlatformIcon } from '../ui/PlatformIcon';
import { outputFormatNote, type CreateType, type VisualSource } from '../../utils/createStudio';
import type { CarModelMatch } from '../../services/createStudio';
import { FIELD_CLASS, LABEL_CLASS } from './fieldStyles';

type IconPlatform = Parameters<typeof PlatformIcon>[0]['platform'];

const TYPES = [
  { id: 'image' as const, label: 'Image Post', desc: 'A branded photo post', icon: ImageIcon },
  { id: 'reel' as const, label: 'Reel (Video)', desc: 'A short vertical video', icon: Film },
];

const SOURCES = [
  { id: 'generate_scratch' as const, label: 'Scratch AI', desc: 'AI scene + your car', icon: Wand2 },
  { id: 'add_inspiration' as const, label: 'Inspiration', desc: 'Recreate a reference', icon: ImageIcon },
  { id: 'add_creative' as const, label: 'Branded', desc: 'Use your image as-is', icon: Upload },
];

export function TypePicker({ value, onChange }: { value: CreateType; onChange: (type: CreateType) => void }) {
  return (
    <div>
      <label className={LABEL_CLASS}>What are you creating?</label>
      <div className="mt-1.5 grid grid-cols-2 gap-3">
        {TYPES.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(t.id)}
              className={cn('flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all', active ? 'border-orange-400 bg-orange-50 shadow-sm' : 'border-zinc-200 hover:bg-zinc-50')}
            >
              <span className={cn('grid place-items-center w-9 h-9 rounded-lg shrink-0', active ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-500')}>
                <t.icon className="w-4.5 h-4.5" />
              </span>
              <span className="min-w-0">
                <span className={cn('block text-sm font-bold leading-tight', active ? 'text-orange-700' : 'text-zinc-800')}>{t.label}</span>
                <span className="block text-[11px] text-zinc-400 leading-tight mt-0.5">{t.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface PlatformPickerProps {
  type: CreateType;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  format: string;
  onToggle: (id: string) => void;
  onConnect: () => void;
}

export function PlatformPicker({ type, options, selected, format, onToggle, onConnect }: PlatformPickerProps) {
  return (
    <div>
      <label className={LABEL_CLASS}>Post to</label>
      {options.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-zinc-500">
          No {type === 'reel' ? 'video-capable ' : ''}accounts connected.{' '}
          <button type="button" onClick={onConnect} className="font-semibold text-orange-600 hover:text-orange-700">Connect accounts</button>
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {options.map((p) => {
            const active = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => onToggle(p.id)}
                className={cn('inline-flex items-center gap-2 rounded-xl border px-3 py-2 transition-all', active ? 'border-orange-400 bg-orange-50 shadow-sm' : 'border-zinc-200 hover:bg-zinc-50')}
              >
                <PlatformIcon platform={p.id as IconPlatform} size="sm" />
                <span className={cn('text-sm font-semibold', active ? 'text-orange-700' : 'text-zinc-700')}>{p.label}</span>
                {active && <Check className="w-3.5 h-3.5 text-orange-500" />}
              </button>
            );
          })}
        </div>
      )}
      {selected.length > 0 && (
        <p className="text-[11px] text-zinc-400 mt-1.5">
          Output format: <span className="font-semibold text-zinc-600">{format}</span> {outputFormatNote(selected)}
        </p>
      )}
      {type === 'reel' && (selected.includes('facebook') || selected.includes('instagram')) && (
        <p className="text-[11px] text-zinc-400 mt-1 flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 shrink-0" /> Facebook &amp; Instagram reels publish only on a live (non-localhost) deployment.
        </p>
      )}
    </div>
  );
}

export function SourcePicker({ value, onChange }: { value: VisualSource; onChange: (source: VisualSource) => void }) {
  return (
    <div>
      <label className={LABEL_CLASS}>Visual source</label>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {SOURCES.map((s) => {
          const active = value === s.id;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(s.id)}
              className={cn('rounded-xl border p-2.5 text-left transition-all', active ? 'border-orange-400 bg-orange-50 shadow-sm' : 'border-zinc-200 hover:bg-zinc-50')}
            >
              <s.icon className={cn('w-4 h-4 mb-1', active ? 'text-orange-600' : 'text-zinc-400')} />
              <p className={cn('text-[12px] font-bold leading-tight', active ? 'text-orange-700' : 'text-zinc-700')}>{s.label}</p>
              <p className="text-[10px] text-zinc-400 leading-snug mt-0.5">{s.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PromptField({ type, source, value, onChange }: { type: CreateType; source: VisualSource; value: string; onChange: (value: string) => void }) {
  const label = type === 'reel' ? 'What is your reel about?' : source === 'add_creative' ? 'Caption idea (optional)' : 'What do you want to post?';
  return (
    <div>
      <label htmlFor="create-prompt" className={LABEL_CLASS}>{label}</label>
      <textarea
        id="create-prompt"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 500))}
        rows={3}
        placeholder={type === 'reel' ? 'e.g. Show off the new Creta with a bold summer exchange offer' : 'e.g. Diwali exchange offer on the Swift — festive, family vibe'}
        className={FIELD_CLASS}
      />
    </div>
  );
}

interface AttachBlockProps {
  type: CreateType;
  source: VisualSource;
  uploadUrl: string | null;
  matchedCar: CarModelMatch | null;
  matching: boolean;
  uploading: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}

export function AttachBlock({ type, source, uploadUrl, matchedCar, matching, uploading, onFile, onClear }: AttachBlockProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const required = type === 'image' && source !== 'generate_scratch';
  const pick = () => inputRef.current?.click();

  let body: ReactNode;
  if (uploadUrl) {
    body = (
      <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/40 p-2.5">
        <img src={uploadUrl} alt="" className="w-16 h-12 rounded-lg object-cover bg-zinc-100 shrink-0" />
        <p className="flex-1 text-[13px] font-semibold text-zinc-800">
          {required ? (source === 'add_inspiration' ? 'Reference attached' : 'Your creative attached') : 'Using your uploaded photo'}
        </p>
        <button type="button" onClick={onClear} aria-label="Remove image" className="p-1.5 rounded-lg text-zinc-400 hover:bg-white hover:text-zinc-700">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  } else if (type === 'image' && source === 'generate_scratch' && matchedCar) {
    body = (
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2.5">
        <img
          src={matchedCar.image_url}
          alt=""
          className="w-16 h-12 rounded-lg object-cover bg-zinc-100 shrink-0"
          onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-zinc-900 leading-tight">{matchedCar.brand} {matchedCar.model_name}</p>
          <p className="text-[11px] text-zinc-500 capitalize">
            Auto-matched from your prompt{matchedCar.color ? ` · ${matchedCar.color}` : ''}
          </p>
        </div>
        {matching && <LoaderCircle className="w-3.5 h-3.5 animate-spin text-zinc-400" />}
        <button type="button" onClick={pick} className="text-[11px] font-medium rounded-lg border border-zinc-200 px-2.5 py-1 text-zinc-600 hover:bg-zinc-50">
          Upload own
        </button>
      </div>
    );
  } else {
    const text = type === 'reel'
      ? 'Attach a car photo (optional)'
      : source === 'add_inspiration'
        ? 'Upload a reference image (required)'
        : source === 'add_creative'
          ? 'Upload your creative (required)'
          : matching ? 'Finding a matching car…' : 'Attach a car photo (optional)';
    body = (
      <button
        type="button"
        onClick={pick}
        disabled={uploading}
        className={cn('w-full flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-[12px] hover:bg-zinc-50', required ? 'border-orange-300 text-orange-600' : 'border-zinc-300 text-zinc-500')}
      >
        {uploading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {text}
      </button>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      {body}
    </div>
  );
}
