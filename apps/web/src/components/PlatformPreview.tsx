import { ImagePlus, Sparkles } from 'lucide-react';

export interface PlatformPreviewProps {
  platform: 'facebook' | 'instagram' | 'google' | 'twitter' | 'youtube';
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

// ─── X (Twitter) ──────────────────────────────────────────────────────────────
function XPreview({ dealerName, dealerInitials, caption, imageUrl, isGenerating, promptText, selectedDesign }: Omit<PlatformPreviewProps, 'platform'>) {
  const handle = `@${dealerName.toLowerCase().replace(/\s+/g, '').slice(0, 15)}`;
  const truncated = caption.length > 280 ? caption.slice(0, 280) + '…' : caption;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#000000' }}>
      {/* X top bar */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#000000', borderBottom: '1px solid #2f3336' }}>
        {/* X logo */}
        <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.906-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <div className="flex gap-2">
          <div className="w-5 h-5 bg-white/10 rounded-full" />
          <div className="w-5 h-5 bg-white/10 rounded-full" />
        </div>
      </div>

      {/* Tweet card */}
      <div className="px-3 pt-3" style={{ borderBottom: '1px solid #2f3336' }}>
        {/* Author row */}
        <div className="flex items-start gap-2.5 mb-2">
          <div className="w-9 h-9 bg-orange-600 rounded-full flex items-center justify-center shrink-0">
            <span className="text-[10px] font-black text-white">{dealerInitials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] font-bold text-white leading-tight">{dealerName}</span>
              {/* Verified blue checkmark */}
              <svg viewBox="0 0 24 24" fill="#1D9BF0" className="w-3.5 h-3.5 shrink-0">
                <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.88 9.33 2 10.57 2 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.81c.66 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.33-2.19c1.4.46 2.91.2 3.92-.81s1.26-2.52.8-3.91c1.32-.67 2.2-1.91 2.2-3.34zm-11.49 3.82L7.4 12.5l1.06-1.06 2.3 2.3 4.78-4.78 1.06 1.06-5.84 5.8z" />
              </svg>
              <span className="text-[10px] text-[#71767b] leading-tight">{handle}</span>
            </div>
            <span className="text-[9px] text-[#71767b]">now</span>
          </div>
          {/* Follow button */}
          <button className="text-[10px] font-bold text-black bg-white px-3 py-1 rounded-full shrink-0 leading-none">
            Follow
          </button>
        </div>

        {/* Tweet text */}
        {truncated && (
          <p className="text-[11px] text-white leading-relaxed mb-2.5 whitespace-pre-line">
            {truncated}
            {caption.length > 280 && <span className="text-[#1D9BF0] cursor-pointer"> Show more</span>}
          </p>
        )}

        {/* Image / placeholder */}
        {(imageUrl || isGenerating || promptText) && (
          <div className="rounded-2xl overflow-hidden mb-2.5" style={{ border: '1px solid #2f3336' }}>
            <PostImage imageUrl={imageUrl} isGenerating={isGenerating} promptText={promptText} selectedDesign={selectedDesign} square={false} />
          </div>
        )}

        {/* Metrics row */}
        <div className="flex items-center gap-4 py-2.5" style={{ borderTop: '1px solid #2f3336' }}>
          {/* Reply */}
          <div className="flex items-center gap-1 text-[#71767b]">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z" />
            </svg>
            <span className="text-[10px] font-medium">12</span>
          </div>
          {/* Repost */}
          <div className="flex items-center gap-1 text-[#71767b]">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z" />
            </svg>
            <span className="text-[10px] font-medium">4</span>
          </div>
          {/* Like */}
          <div className="flex items-center gap-1 text-[#71767b]">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z" />
            </svg>
            <span className="text-[10px] font-medium">87</span>
          </div>
          {/* Bookmark */}
          <div className="flex items-center gap-1 text-[#71767b]">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z" />
            </svg>
            <span className="text-[10px] font-medium">23</span>
          </div>
          {/* Share */}
          <div className="flex items-center gap-1 text-[#71767b] ml-auto">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Faded second tweet hint */}
      <div className="px-3 pt-2 opacity-20">
        <div className="flex gap-2.5">
          <div className="w-9 h-9 bg-stone-600 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5 pt-1">
            <div className="h-2 bg-stone-600 rounded-full w-2/3" />
            <div className="h-2 bg-stone-700 rounded-full w-full" />
            <div className="h-2 bg-stone-700 rounded-full w-4/5" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── YouTube Shorts ───────────────────────────────────────────────────────────
function YouTubePreview({ dealerName, dealerInitials, caption, imageUrl, isGenerating, promptText, selectedDesign }: Omit<PlatformPreviewProps, 'platform'>) {
  const gradient = TEMPLATE_GRADIENTS[Math.min(selectedDesign, 2)] ?? TEMPLATE_GRADIENTS[0]!;
  const truncated = caption.length > 80 ? caption.slice(0, 80) + '…' : caption;

  return (
    <div className="flex-1 overflow-hidden relative" style={{ background: '#0f0f0f' }}>
      {/* Full-bleed 9:16 video background */}
      <div className="absolute inset-0">
        {imageUrl ? (
          <img src={imageUrl} alt="YouTube Shorts" className="w-full h-full object-cover" />
        ) : isGenerating ? (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <Sparkles className="w-10 h-10 text-white/50 animate-pulse" />
          </div>
        ) : promptText ? (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex flex-col items-center justify-center p-6`}>
            <p className="text-white text-[13px] font-bold text-center leading-snug">
              {promptText.slice(0, 60)}{promptText.length > 60 ? '…' : ''}
            </p>
          </div>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-stone-800 to-stone-900 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="white" className="w-12 h-12 opacity-30">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>
        )}

        {/* Dark gradient overlay at bottom for legibility */}
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      </div>

      {/* Top bar: Shorts logo + close */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 pt-2.5 z-10">
        <div className="flex items-center gap-1.5">
          {/* Shorts icon */}
          <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5 drop-shadow">
            <path d="M10 14.65v-5.3L15 12l-5 2.65zm7.77-4.33c-.77-.32-1.2-.5-1.2-.5L18 9.06c1.84-.96 2.53-3.23 1.56-5.06s-3.24-2.53-5.07-1.56L6 6.94c-1.29.68-2.07 2.04-2 3.49.07 1.42.93 2.67 2.22 3.25.03.01 1.2.5 1.2.5L6 14.93c-1.83.97-2.53 3.24-1.56 5.07.97 1.83 3.24 2.53 5.07 1.56l8.5-4.5c1.29-.68 2.06-2.04 1.99-3.49-.07-1.42-.94-2.68-2.23-3.25z" />
          </svg>
          <span className="text-white text-[10px] font-bold drop-shadow">Shorts</span>
        </div>
        <button className="w-6 h-6 bg-black/40 rounded-full flex items-center justify-center">
          <span className="text-white text-[11px] leading-none">✕</span>
        </button>
      </div>

      {/* Progress bar */}
      <div className="absolute top-9 left-0 right-0 h-[2px] bg-white/20 z-10">
        <div className="h-full bg-white rounded-full" style={{ width: '42%' }} />
      </div>

      {/* Right side action column */}
      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-4 z-10">
        {/* Channel avatar */}
        <div className="relative">
          <div className="w-9 h-9 bg-orange-600 rounded-full flex items-center justify-center shadow-lg" style={{ border: '2px solid white' }}>
            <span className="text-[9px] font-black text-white">{dealerInitials}</span>
          </div>
          {/* Subscribe "+" button */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center">
            <span className="text-white text-[9px] font-black leading-none">+</span>
          </div>
        </div>

        {/* Like */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-9 h-9 bg-black/40 rounded-full flex items-center justify-center">
            <span className="text-white text-[15px]">♡</span>
          </div>
          <span className="text-white text-[9px] font-semibold drop-shadow">1.2K</span>
        </div>

        {/* Comment */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-9 h-9 bg-black/40 rounded-full flex items-center justify-center">
            <span className="text-white text-[13px]">💬</span>
          </div>
          <span className="text-white text-[9px] font-semibold drop-shadow">48</span>
        </div>

        {/* Share */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-9 h-9 bg-black/40 rounded-full flex items-center justify-center">
            <span className="text-white text-[13px]">↗</span>
          </div>
          <span className="text-white text-[9px] font-semibold drop-shadow">Share</span>
        </div>

        {/* Spinning vinyl disc (music credit) */}
        <div className="w-9 h-9 rounded-full overflow-hidden shadow-lg animate-spin-slow" style={{ border: '2px solid white/40' }}>
          <div className="w-full h-full bg-gradient-to-br from-stone-700 via-stone-900 to-stone-700 flex items-center justify-center relative">
            {/* Vinyl grooves */}
            <div className="absolute inset-1 rounded-full border border-white/10" />
            <div className="absolute inset-2 rounded-full border border-white/10" />
            <div className="w-2.5 h-2.5 bg-stone-400 rounded-full" />
          </div>
        </div>
      </div>

      {/* Bottom channel info overlay */}
      <div className="absolute bottom-0 left-0 right-12 px-3 pb-3 z-10">
        {/* Channel name + subscribe */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-white text-[11px] font-bold drop-shadow truncate">@{dealerName.toLowerCase().replace(/\s+/g, '')}</span>
          <button className="bg-white text-black text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 leading-none">
            Subscribe
          </button>
        </div>

        {/* Description */}
        {truncated && (
          <p className="text-white/90 text-[9px] leading-relaxed drop-shadow">
            {truncated}
          </p>
        )}

        {/* Music credit */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="text-white/70 text-[9px]">🎵</span>
          <span className="text-white/70 text-[9px] truncate">Original audio · {dealerName}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function PlatformPreview(props: PlatformPreviewProps) {
  if (props.platform === 'instagram') return <InstagramPreview {...props} />;
  if (props.platform === 'google')    return <GooglePreview {...props} />;
  if (props.platform === 'twitter')   return <XPreview {...props} />;
  if (props.platform === 'youtube')   return <YouTubePreview {...props} />;
  return <FacebookPreview {...props} />;
}
