import { truncateText } from '../../../utils/createStudio';
import { Avatar, MediaSlot, type PostPreviewProps } from './PreviewParts';

export function FacebookPostPreview({ dealerName, initials, logoUrl, caption, imageUrl, isGenerating }: PostPreviewProps) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#f0f2f5' }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: '#1877F2' }}>
        <span className="text-white text-[10px] font-black tracking-tight">facebook</span>
        <div className="flex gap-1.5">
          <div className="w-5 h-5 bg-white/20 rounded-full" />
          <div className="w-5 h-5 bg-white/20 rounded-full" />
        </div>
      </div>
      <div className="bg-white mx-1 mt-1.5 rounded-lg shadow-sm overflow-hidden">
        <div className="flex items-start gap-2 px-3 pt-2.5 pb-2">
          <Avatar logoUrl={logoUrl} initials={initials} size="w-9 h-9" text="text-[10px]" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 flex-wrap">
              <p className="text-[11px] font-bold text-[#050505] leading-none">{dealerName}</p>
              <span className="text-[10px] text-[#1877F2] font-bold">✓</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[9px] text-[#65676B]">Just now · </span>
              <svg className="w-2.5 h-2.5 text-[#65676B]" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11z" />
              </svg>
            </div>
          </div>
          <div className="flex gap-1 shrink-0" aria-hidden="true">
            <span className="w-6 h-6 rounded-full bg-[#f0f2f5] flex items-center justify-center"><span className="text-[12px] leading-none text-[#65676B]">···</span></span>
            <span className="w-6 h-6 rounded-full bg-[#f0f2f5] flex items-center justify-center"><span className="text-[10px] leading-none text-[#65676B]">✕</span></span>
          </div>
        </div>
        {caption && (
          <p className="text-[10px] text-[#050505] px-3 pb-2 leading-relaxed">
            {truncateText(caption, 120)}
            {caption.length > 120 && <span className="text-[#65676B] cursor-pointer"> See more</span>}
          </p>
        )}
        <MediaSlot imageUrl={imageUrl} isGenerating={isGenerating} />
        <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#ced0d4]">
          <div className="flex items-center gap-1">
            <div className="flex -space-x-0.5"><span className="text-[12px]">👍</span><span className="text-[12px]">❤️</span></div>
            <span className="text-[9px] text-[#65676B] ml-0.5">You and 24 others</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#65676B]">3 comments</span>
            <span className="text-[9px] text-[#65676B]">1 share</span>
          </div>
        </div>
        <div className="flex items-center" aria-hidden="true">
          {[['👍', 'Like'], ['💬', 'Comment'], ['↗', 'Share']].map(([icon, label]) => (
            <span key={label} className="flex-1 flex items-center justify-center gap-1 py-1.5">
              <span className="text-[12px]">{icon}</span>
              <span className="text-[10px] font-semibold text-[#65676B]">{label}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-[#ced0d4]">
          <div className="w-6 h-6 bg-orange-600 rounded-full flex items-center justify-center shrink-0">
            <span className="text-[8px] font-black text-white">{initials[0]}</span>
          </div>
          <div className="flex-1 bg-[#f0f2f5] rounded-full px-3 py-1"><span className="text-[9px] text-[#65676B]">Write a comment…</span></div>
        </div>
      </div>
      <div className="bg-white mx-1 mt-1.5 rounded-lg shadow-sm overflow-hidden opacity-30 h-12 mb-2" />
    </div>
  );
}
