import { CircleAlert, CircleCheck, Clock, FileText, Inbox, LoaderCircle, Plus, type LucideIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import type { PostTab } from '../../utils/posts';

const EMPTY: Record<PostTab, { icon: LucideIcon; title: string; sub: string }> = {
  all: { icon: FileText, title: 'No posts yet', sub: 'Create your first post to start reaching customers across your social channels.' },
  draft: { icon: FileText, title: 'No drafts', sub: 'Drafts appear here when you save a post without publishing it.' },
  pending_approval: { icon: Inbox, title: 'Nothing to approve', sub: 'Posts submitted for approval will show up here.' },
  approved: { icon: CircleCheck, title: 'Nothing ready', sub: 'Approved posts that are ready to publish will appear here.' },
  scheduled: { icon: Clock, title: 'Nothing scheduled', sub: 'Schedule a post when creating it to keep a steady posting cadence.' },
  publishing: { icon: LoaderCircle, title: 'Nothing publishing', sub: 'Posts currently going out will appear here.' },
  published: { icon: CircleCheck, title: 'No published posts', sub: 'Published posts and their links will appear here.' },
  failed: { icon: CircleAlert, title: 'No failed posts', sub: 'Everything is running smoothly — nothing has failed.' },
};

export function PostsEmptyState({ status, onCreate }: { status: PostTab; onCreate: () => void }) {
  const { icon: Icon, title, sub } = EMPTY[status];
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <div className="w-14 h-14 rounded-full bg-zinc-50 ring-1 ring-zinc-100 flex items-center justify-center text-zinc-400">
        <Icon className="w-6 h-6" />
      </div>
      <p className="mt-4 text-sm font-semibold text-zinc-800">{title}</p>
      <p className="mt-1 max-w-sm text-[13px] text-zinc-400 leading-relaxed">{sub}</p>
      {(status === 'all' || status === 'draft') && (
        <Button className="mt-5" onClick={onCreate}><Plus className="w-4 h-4" /> Create post</Button>
      )}
    </div>
  );
}
