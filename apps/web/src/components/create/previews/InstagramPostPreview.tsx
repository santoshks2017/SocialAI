import { instagramHandle, truncateText } from '../../../utils/createStudio';
import { MediaSlot, type PostPreviewProps } from './PreviewParts';

const STORIES = ['You', 'Ravi', 'Priya', 'Ajay'];

export function InstagramPostPreview({ dealerName, initials, logoUrl, caption, imageUrl, isGenerating }: PostPreviewProps) {
  const handle = instagramHandle(dealerName);
  const tags = (caption.match(/#[\p{L}\p{M}\p{N}_]+/gu) ?? []).slice(0, 4).join(' ');
  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#dbdbdb]">
        <span className="text-[11px] font-black text-black" style={{ fontFamily: 'serif', fontStyle: 'italic' }}>Instagram</span>
        <div className="flex items-center gap-2"><span className="text-[12px]">♡</span><span className="text-[12px]">✉</span></div>
      </div>
      <div className="flex gap-2 px-3 py-2 border-b border-[#dbdbdb] overflow-hidden">
        {STORIES.map((name, i) => (
          <div key={name} className="flex flex-col items-center gap-0.5 shrink-0">
            <div className={`w-8 h-8 rounded-full ${i === 0 ? 'bg-orange-600' : 'bg-gradient-to-tr from-yellow-400 to-pink-500'} flex items-center justify-center`} style={i === 0 ? undefined : { padding: 2 }}>
              {i === 0 ? (
                <span className="text-[8px] font-black text-white">{initials[0]}</span>
              ) : (
                <div className="w-full h-full bg-white rounded-full flex items-center justify-center"><span className="text-[7px] font-bold text-zinc-600">{name[0]}</span></div>
              )}
            </div>
            <span className="text-[7px] text-zinc-500 truncate w-8 text-center">{i === 0 ? 'Your' : name}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-500 p-[1.5px] shrink-0">
            <div className="w-full h-full rounded-full bg-white p-[1px]">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="w-full h-full rounded-full object-cover bg-white" />
              ) : (
                <div className="w-full h-full rounded-full bg-orange-600 flex items-center justify-center"><span className="text-[7px] font-black text-white">{initials}</span></div>
              )}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-black leading-none">{handle}</p>
            <p className="text-[8px] text-[#8e8e8e] leading-none mt-0.5">Sponsored</p>
          </div>
        </div>
        <span className="text-[14px] text-black leading-none">···</span>
      </div>
      <MediaSlot imageUrl={imageUrl} isGenerating={isGenerating} />
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <div className="flex items-center gap-3">
          <span className="text-[18px] leading-none">♡</span>
          <span className="text-[16px] leading-none">💬</span>
          <span className="text-[16px] leading-none">↗</span>
        </div>
        <span className="text-[16px] leading-none">🔖</span>
      </div>
      <div className="px-3 pb-1"><p className="text-[10px] font-bold text-black">1,284 likes</p></div>
      <div className="px-3 pb-1">
        <p className="text-[10px] text-black leading-relaxed">
          <span className="font-bold">{handle} </span>
          {truncateText(caption, 90)}
          {caption.length > 90 && <span className="text-[#8e8e8e] cursor-pointer"> more</span>}
        </p>
      </div>
      <div className="px-3 pb-1"><p className="text-[9px] text-[#8e8e8e]">View all 24 comments</p></div>
      {caption && tags && <div className="px-3 pb-1"><p className="text-[9px] text-[#00376B] truncate">{tags}</p></div>}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[#dbdbdb]">
        <div className="w-5 h-5 bg-orange-600 rounded-full flex items-center justify-center shrink-0"><span className="text-[6px] font-black text-white">{initials[0]}</span></div>
        <p className="text-[9px] text-[#8e8e8e] flex-1">Add a comment…</p>
        <span className="text-[9px] text-[#0095F6] font-semibold">Post</span>
      </div>
      <div className="px-3 pb-2"><p className="text-[8px] text-[#8e8e8e] uppercase tracking-wide">2 hours ago</p></div>
      <div className="border-t border-[#dbdbdb] opacity-20 h-10 mt-1" />
    </div>
  );
}
