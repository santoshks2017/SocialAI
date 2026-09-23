import { truncateText } from '../../../utils/createStudio';
import { Avatar, MediaSlot, type PostPreviewProps } from './PreviewParts';

const STAR = 'M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z';

export function GooglePostPreview({ dealerName, initials, logoUrl, caption, imageUrl, isGenerating }: PostPreviewProps) {
  const query = /dealer/i.test(dealerName) ? dealerName : `${dealerName} dealer`;
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#f1f3f4' }}>
      <div className="px-2 pt-2 pb-1.5">
        <div className="bg-white rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm border border-[#dfe1e5]">
          <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" strokeWidth="2.5" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <span className="text-[9px] text-[#202124] flex-1 truncate">{query}</span>
          <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="#4285f4" aria-hidden="true"><path d="M12 2a7 7 0 00-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" /></svg>
        </div>
      </div>
      <div className="bg-white mx-2 rounded-xl shadow-sm overflow-hidden border border-[#dfe1e5]">
        <div className="px-3 pt-3 pb-2 flex items-start gap-2">
          <Avatar logoUrl={logoUrl} initials={initials} size="w-10 h-10" text="text-[11px]" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-[11px] font-bold text-[#202124] leading-none truncate">{dealerName}</p>
              <svg className="w-3 h-3 shrink-0 text-[#4285f4]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 2.2 3.2-.4.9 3.1 2.9 1.4-1 3.1 1 3.1-2.9 1.4-.9 3.1-3.2-.4L12 22l-2.4-2.2-3.2.4-.9-3.1-2.9-1.4 1-3.1-1-3.1 2.9-1.4.9-3.1 3.2.4zM10.6 15.4l6-6-1.4-1.4-4.6 4.6-2-2-1.4 1.4z" /></svg>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[9px] text-[#70757a]">Car dealer</span>
              <span className="text-[9px] text-[#70757a]">·</span>
              <span className="text-[9px] text-[#70757a]">Open ⌄</span>
            </div>
            <div className="flex items-center gap-0.5 mt-0.5">
              <span className="text-[9px] font-bold text-[#202124]">4.8</span>
              {[1, 2, 3, 4, 5].map((i) => (
                <svg key={i} className={`w-2.5 h-2.5 ${i <= 4 ? 'text-[#f9ab00]' : 'text-[#dfe1e5]'}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d={STAR} /></svg>
              ))}
              <span className="text-[9px] text-[#70757a]">(243)</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1.5 px-3 pb-2" aria-hidden="true">
          {[['📍', 'Directions'], ['📞', 'Call'], ['🌐', 'Website']].map(([icon, label]) => (
            <span key={label} className="flex-1 flex flex-col items-center gap-0.5 py-1.5 bg-[#e8f0fe] rounded-lg">
              <span className="text-[11px]">{icon}</span>
              <span className="text-[8px] font-semibold text-[#1a73e8]">{label}</span>
            </span>
          ))}
        </div>
        <div className="border-t border-[#dfe1e5] mx-3" />
        <div className="px-3 py-2">
          <p className="text-[9px] font-bold text-[#202124] mb-1.5 uppercase tracking-wide">Updates</p>
          <div className="border border-[#dfe1e5] rounded-xl overflow-hidden">
            <MediaSlot imageUrl={imageUrl} isGenerating={isGenerating} square={false} />
            <div className="p-2.5">
              <p className="text-[9px] text-[#202124] leading-relaxed mb-2">
                {truncateText(caption, 100)}
                {caption.length > 100 && <span className="text-[#1a73e8] cursor-pointer"> Learn more</span>}
              </p>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 bg-white border border-[#dadce0] rounded-full px-2.5 py-1 text-[9px] font-semibold text-[#1a73e8]">📞 Call now</span>
                <span className="text-[8px] text-[#70757a]">Today</span>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-[#dfe1e5] mx-3 mb-2" />
        <div className="px-3 pb-2.5">
          <p className="text-[9px] font-bold text-[#202124] mb-1.5 uppercase tracking-wide">Reviews</p>
          <div className="flex gap-2 items-start opacity-40">
            <div className="w-5 h-5 bg-zinc-300 rounded-full shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-1.5 bg-zinc-200 rounded-full w-3/4" />
              <div className="h-1.5 bg-zinc-200 rounded-full w-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="h-3" />
    </div>
  );
}
