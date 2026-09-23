import type { ReactNode } from 'react';

// Compact empty state for cards (the full-page one is EmptyState).
export function InlineEmpty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center text-zinc-300 mb-2">{icon}</div>
      <p className="text-xs text-zinc-400 max-w-[220px] leading-relaxed">{text}</p>
    </div>
  );
}
