import { Sparkles } from 'lucide-react';

export function Logo() {
  return (
    <>
      <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-sm shadow-orange-500/30">
        <Sparkles className="w-[18px] h-[18px] text-white" />
      </div>
      <span className="font-semibold text-zinc-900 text-[15px] tracking-tight">
        Social <span className="bg-gradient-to-r from-orange-600 to-amber-500 bg-clip-text text-transparent">AI</span>
      </span>
    </>
  );
}
