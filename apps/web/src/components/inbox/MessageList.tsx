import type { ReactNode } from 'react';
import { MessageSquare, SearchX } from 'lucide-react';

export function MessageSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-zinc-200/80 p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-zinc-100 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-28 bg-zinc-100 rounded" />
            <div className="h-4 w-16 bg-zinc-100 rounded-full" />
          </div>
          <div className="h-3 w-full bg-zinc-100 rounded" />
          <div className="h-3 w-2/3 bg-zinc-100 rounded" />
        </div>
      </div>
    </div>
  );
}

function EmptyCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-200/80 p-10 text-center">
      <div className="w-11 h-11 mx-auto rounded-full bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center text-zinc-400 mb-3">{icon}</div>
      <p className="text-sm font-semibold text-zinc-800">{title}</p>
      <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">{text}</p>
    </div>
  );
}

export function NoMessages() {
  return (
    <EmptyCard
      icon={<MessageSquare className="w-5 h-5" />}
      title="No messages yet"
      text="Connect your Facebook, Instagram, and Google Business Profile in Accounts to receive customer reviews and comments here."
    />
  );
}

export function NoResults() {
  return <EmptyCard icon={<SearchX className="w-5 h-5" />} title="No results found" text="Try adjusting your search or filters." />;
}
