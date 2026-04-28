import { ImagePlus, Sparkles } from 'lucide-react';

export interface PlatformPreviewProps {
  platform: 'facebook' | 'instagram' | 'google';
  dealerName: string;
  dealerInitials: string;
  caption: string;
  imageUrl: string | null;
  isGenerating: boolean;
  promptText: string;
  selectedDesign: number;
}

const TEMPLATE_GRADIENTS = [
  'from-stone-900 to-stone-800',
  'from-orange-600 to-orange-500',
  'from-teal-700 to-teal-600',
];

function PostImage({ imageUrl, isGenerating, promptText, selectedDesign, square = true }: {
  imageUrl: string | null;
  isGenerating: boolean;
  promptText: string;
  selectedDesign: number;
  square?: boolean;
}) {
  const gradient = TEMPLATE_GRADIENTS[Math.min(selectedDesign, 2)] ?? TEMPLATE_GRADIENTS[0]!;
  const cls = square ? 'w-full aspect-square' : 'w-full aspect-[4/3]';
  if (imageUrl) {
    return <img src={imageUrl} alt="Creative" className={`${cls} object-cover`} />;
  }
  if (isGenerating) {
    return (
      <div className={`${cls} bg-gradient-to-br ${gradient} flex items-center justify-center`}>
        <Sparkles className="w-8 h-8 text-white/60 animate-pulse" />
      </div>
    );
  }
  if (promptText) {
    return (
      <div className={`${cls} bg-gradient-to-br ${gradient} flex flex-col items-center justify-center p-4`}>
        <p className="text-white text-[11px] font-bold text-center leading-snug">
          {promptText.slice(0, 60)}{promptText.length > 60 ? '…' : ''}
        </p>
      </div>
    );
  }
  return (
    <div className={`${cls} bg-stone-100 flex items-center justify-center`}>
      <ImagePlus className="w-7 h-7 text-stone-300" />
    </div>
  );
}

// ─── Facebook ─────────────────────────────────────────────────────────────────
function FacebookPreview({ dealerName, dealerInitials, caption, imageUrl, isGenerating, promptText, selectedDesign }: Omit<PlatformPreviewProps, 'platform'>) {
  const truncated = caption.length > 120 ? caption.slice(0, 120) + '…' : caption;
  const igHandle = dealerName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_.]/g, '');

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#f0f2f5' }}>
      {/* FB top bar hint */}
      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: '#1877F2' }}>
        <span className="text-white text-[10px] font-black tracking-tight">facebook</span>
        <div className="flex gap-1.5">
          <div className="w-5 h-5 bg-white/20 rounded-full" />
          <div className="w-5 h-5 bg-white/20 rounded-full" />
        </div>
      </div>

      {/* Feed post card */}
      <div className="bg-white mx-1 mt-1.5 rounded-lg shadow-sm overflow-hidden">
        {/* Post header */}
        <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
          <div className="w-9 h-9 bg-orange-600 rounded-full flex items-center justify-center shrink-0">
            <span className="text-[10px] font-black text-white">{dealerInitials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <p className="text-[11px] font-bold text-[#050505] leading-none">{dealerName}</p>
              <span className="text-[10px] text-[#1877F2] font-bold">✓</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[9px] text-[#65676B]">Just now · </span>
              <svg className="w-2.5 h-2.5 text-[#65676B]" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 14A6 6 0 118 2a6 6 0 010 12z" />
              </svg>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button className="w-6 h-6 rounded-full bg-[#f0f2f5] flex items-center justify-center">
              <span className="text-[12px] leading-none text-[#65676B]">···</span>
            </button>
            <button className="w-6 h-6 rounded-full bg-[#f0f2f5] flex items-center justify-center">
              <span className="text-[10px] leading-none text-[#65676B]">✕</span>
            </button>
          </div>
        </div>

        {/* Caption */}
        {caption && (
          <p className="text-[10px] text-[#050505] px-3 pb-2 leading-relaxed">
            {truncated}
            {caption.length > 120 && (
              <span className="text-[#65676B] cursor-pointer"> See more</span>
            )}
          </p>
        )}

        {/* Image */}
        <PostImage imageUrl={imageUrl} isGenerating={isGenerating} promptText={promptText} selectedDesign={selectedDesign} square />

        {/* Reactions row */}
        <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#ced0d4]">
          <div className="flex items-center gap-1">
            <div className="flex -space-x-0.5">
              <span className="text-[12px]">👍</span>
              <span className="text-[12px]">❤️</span>
            </div>
            <span className="text-[9px] text-[#65676B] ml-0.5">You and 24 others</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#65676B]">3 comments</span>
            <span className="text-[9px] text-[#65676B]">1 share</span>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center">
          {[
            { emoji: '👍', label: 'Like' },
            { emoji: '💬', label: 'Comment' },
            { emoji: '↗', label: 'Share' },
          ].map(({ emoji, label }) => (
            <button key={label} className="flex-1 flex items-center justify-center gap-1 py-1.5 hover:bg-[#f0f2f5] transition-colors">
              <span className="text-[12px]">{emoji}</span>
              <span className="text-[10px] font-semibold text-[#65676B]">{label}</span>
            </button>
          ))}
        </div>

        {/* Comment input */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[#ced0d4]">
          <div className="w-6 h-6 bg-orange-600 rounded-full flex items-center justify-center shrink-0">
            <span className="text-[8px] font-black text-white">{dealerInitials[0]}</span>
          </div>
          <div className="flex-1 bg-[#f0f2f5] rounded-full px-3 py-1">
            <span className="text-[9px] text-[#65676B]">Write a comment…</span>
          </div>
        </div>
      </div>

      {/* Second faded card to show feed context */}
      <div className="bg-white mx-1 mt-1.5 rounded-lg shadow-sm overflow-hidden opacity-30 h-12 mb-2" />
    </div>
  );
}

// ─── Instagram ────────────────────────────────────────────────────────────────
function InstagramPreview({ dealerName, dealerInitials, caption, imageUrl, isGenerating, promptText, selectedDesign }: Omit<PlatformPreviewProps, 'platform'>) {
  const handle = dealerName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const truncated = caption.length > 90 ? caption.slice(0, 90) + '…' : caption;

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      {/* IG nav bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#dbdbdb]">
        <span className="text-[11px] font-black text-black" style={{ fontFamily: 'serif', fontStyle: 'italic' }}>Instagram</span>
        <div className="flex items-center gap-2">
          <span className="text-[12px]">♡</span>
          <span className="text-[12px]">✉</span>
        </div>
      </div>

      {/* Stories strip */}
      <div className="flex gap-2 px-3 py-2 border-b border-[#dbdbdb] overflow-hidden">
        {['You', 'Ravi', 'Priya', 'Ajay'].map((name, i) => (
          <div key={name} className="flex flex-col items-center gap-0.5 shrink-0">
            <div className={`w-8 h-8 rounded-full ${i === 0 ? 'bg-orange-600' : 'bg-gradient-to-tr from-yellow-400 to-pink-500'} flex items-center justify-center`}
              style={i !== 0 ? { padding: '2px' } : {}}>
              {i === 0 ? (
                <span className="text-[8px] font-black text-white">{dealerInitials[0]}</span>
              ) : (
                <div className="w-full h-full bg-white rounded-full flex items-center justify-center">
                  <span className="text-[7px] font-bold text-stone-600">{name[0]}</span>
                </div>
              )}
            </div>
            <span className="text-[7px] text-stone-500 truncate w-8 text-center">{i === 0 ? 'Your' : name}</span>
          </div>
        ))}
      </div>

      {/* Post */}
      <div>
        {/* Post header */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-500 p-[1.5px] shrink-0">
              <div className="w-full h-full rounded-full bg-white p-[1px]">
                <div className="w-full h-full rounded-full bg-orange-600 flex items-center justify-center">
                  <span className="text-[7px] font-black text-white">{dealerInitials}</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-black leading-none">{handle}</p>
              <p className="text-[8px] text-[#8e8e8e] leading-none mt-0.5">Sponsored</p>
            </div>
          </div>
          <span className="text-[14px] text-black leading-none">···</span>
        </div>

        {/* Image */}
        <PostImage imageUrl={imageUrl} isGenerating={isGenerating} promptText={promptText} selectedDesign={selectedDesign} square />

        {/* Action icons */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <div className="flex items-center gap-3">
            <span className="text-[18px] leading-none">♡</span>
            <span className="text-[16px] leading-none">💬</span>
            <span className="text-[16px] leading-none">↗</span>
          </div>
          <span className="text-[16px] leading-none">🔖</span>
        </div>

        {/* Likes */}
        <div className="px-3 pb-1">
          <p className="text-[10px] font-bold text-black">1,284 likes</p>
        </div>

        {/* Caption */}
        <div className="px-3 pb-1">
          <p className="text-[10px] text-black leading-relaxed">
            <span className="font-bold">{handle} </span>
            {truncated}
            {caption.length > 90 && (
              <span className="text-[#8e8e8e] cursor-pointer"> more</span>
            )}
          </p>
        </div>

        {/* Comments */}
        <div className="px-3 pb-1">
          <p className="text-[9px] text-[#8e8e8e]">View all 24 comments</p>
        </div>

        {/* Hashtags */}
        {caption && (
          <div className="px-3 pb-1">
            <p className="text-[9px] text-[#00376B] truncate">
              {(caption.match(/#\w+/g) ?? []).slice(0, 4).join(' ')}
            </p>
          </div>
        )}

        {/* Comment input */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[#dbdbdb]">
          <div className="w-5 h-5 bg-orange-600 rounded-full flex items-center justify-center shrink-0">
            <span className="text-[6px] font-black text-white">{dealerInitials[0]}</span>
          </div>
          <p className="text-[9px] text-[#8e8e8e] flex-1">Add a comment…</p>
          <span className="text-[9px] text-[#0095F6] font-semibold">Post</span>
        </div>

        {/* Timestamp */}
        <div className="px-3 pb-2">
          <p className="text-[8px] text-[#8e8e8e] uppercase tracking-wide">2 hours ago</p>
        </div>
      </div>

      {/* Faded next post hint */}
      <div className="border-t border-[#dbdbdb] opacity-20 h-10 mt-1" />
    </div>
  );
}

// ─── Google Business Profile ──────────────────────────────────────────────────
function GooglePreview({ dealerName, dealerInitials, caption, imageUrl, isGenerating, promptText, selectedDesign }: Omit<PlatformPreviewProps, 'platform'>) {
  const truncated = caption.length > 100 ? caption.slice(0, 100) + '…' : caption;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#f1f3f4' }}>
      {/* Google search bar mockup */}
      <div className="px-2 pt-2 pb-1.5">
        <div className="bg-white rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm border border-[#dfe1e5]">
          <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="none">
            <path d="M21.8 21l-5.4-5.4A8 8 0 1 0 4.1 17.9 8 8 0 0 0 16.4 16.4l5.4 5.4.8-.8z" stroke="#9aa0a6" strokeWidth="2" />
          </svg>
          <span className="text-[9px] text-[#202124] flex-1 truncate">{dealerName} {dealerName.toLowerCase().includes('dealer') ? '' : 'dealer'}</span>
          <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="#4285f4">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="#4285f4" strokeWidth="2" />
          </svg>
        </div>
      </div>

      {/* Business card */}
      <div className="bg-white mx-2 rounded-xl shadow-sm overflow-hidden border border-[#dfe1e5]">
        {/* Header */}
        <div className="px-3 pt-3 pb-2 flex items-start gap-2">
          <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-[11px] font-black text-white">{dealerInitials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-[11px] font-bold text-[#202124] leading-none truncate">{dealerName}</p>
              <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0 text-[#4285f4]" fill="currentColor">
                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
              </svg>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[9px] text-[#70757a]">Car dealer</span>
              <span className="text-[9px] text-[#70757a]">·</span>
              <span className="text-[9px] text-[#70757a]">Open ⌄</span>
            </div>
            {/* Stars */}
            <div className="flex items-center gap-0.5 mt-0.5">
              <span className="text-[9px] font-bold text-[#202124]">4.8</span>
              <div className="flex">
                {[1,2,3,4,5].map((s) => (
                  <svg key={s} viewBox="0 0 24 24" className={`w-2.5 h-2.5 ${s <= 4 ? 'text-[#f9ab00]' : 'text-[#dfe1e5]'}`} fill="currentColor">
                    <path d="M12 2l3.1 6.3L22 9.3l-5 4.8 1.2 6.9L12 18l-6.2 3 1.2-6.9-5-4.8 6.9-1z" />
                  </svg>
                ))}
              </div>
              <span className="text-[9px] text-[#70757a]">(243)</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5 px-3 pb-2">
          {[
            { icon: '📍', label: 'Directions' },
            { icon: '📞', label: 'Call' },
            { icon: '🌐', label: 'Website' },
          ].map(({ icon, label }) => (
            <button key={label} className="flex-1 flex flex-col items-center gap-0.5 py-1.5 bg-[#e8f0fe] rounded-lg">
              <span className="text-[11px]">{icon}</span>
              <span className="text-[8px] font-semibold text-[#1a73e8]">{label}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-[#dfe1e5] mx-3" />

        {/* Posts section */}
        <div className="px-3 py-2">
          <p className="text-[9px] font-bold text-[#202124] mb-1.5 uppercase tracking-wide">Updates</p>

          <div className="border border-[#dfe1e5] rounded-xl overflow-hidden">
            {/* Post image */}
            <PostImage imageUrl={imageUrl} isGenerating={isGenerating} promptText={promptText} selectedDesign={selectedDesign} square={false} />

            {/* Post content */}
            <div className="p-2.5">
              <p className="text-[9px] text-[#202124] leading-relaxed mb-2">
                {truncated}
                {caption.length > 100 && <span className="text-[#1a73e8] cursor-pointer"> Learn more</span>}
              </p>
              <div className="flex items-center justify-between">
                <button className="flex items-center gap-1 bg-white border border-[#dadce0] rounded-full px-2.5 py-1 text-[9px] font-semibold text-[#1a73e8]">
                  📞 Call now
                </button>
                <span className="text-[8px] text-[#70757a]">Today</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews section hint */}
        <div className="border-t border-[#dfe1e5] mx-3 mb-2" />
        <div className="px-3 pb-2.5">
          <p className="text-[9px] font-bold text-[#202124] mb-1.5 uppercase tracking-wide">Reviews</p>
          <div className="flex gap-2 items-start opacity-40">
            <div className="w-5 h-5 bg-stone-300 rounded-full shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-1.5 bg-stone-200 rounded-full w-3/4" />
              <div className="h-1.5 bg-stone-200 rounded-full w-full" />
            </div>
          </div>
        </div>
      </div>

      <div className="h-3" />
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function PlatformPreview(props: PlatformPreviewProps) {
  if (props.platform === 'instagram') return <InstagramPreview {...props} />;
  if (props.platform === 'google') return <GooglePreview {...props} />;
  return <FacebookPreview {...props} />;
}
