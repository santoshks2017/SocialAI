import { CircleCheck, Clock, ExternalLink, LoaderCircle, Pencil, RefreshCw, Send, Trash2, X } from 'lucide-react';
import { Button, cn } from '../ui/Button';
import type { Post } from '../../services/creative';
import { approvalRemark, firstCreative, platformResults, postTimeline } from '../../utils/posts';
import type { ConfirmKind } from './PostDialogs';
import { PostStatusBadge } from './PostStatusBadge';
import { PlatformList } from './PlatformList';
import { PostThumbnail } from './PostThumbnail';

const ACTION = 'h-8 px-2.5 text-xs';

export interface PostRowProps {
  post: Post;
  canPublish: boolean;
  canApprove: boolean;
  approving: boolean;
  onOpen: (post: Post) => void;
  onEdit: (post: Post) => void;
  onConfirm: (kind: ConfirmKind, post: Post) => void;
  onApprove: (post: Post) => void;
  onReject: (post: Post) => void;
  onReschedule: (post: Post) => void;
  onSubmitForApproval: (post: Post) => void;
}

export function PostRow(props: PostRowProps) {
  const { post, onOpen, onConfirm } = props;
  const remark = approvalRemark(post);
  return (
    <div
      role="button"
      tabIndex={0}
      title="View details"
      onClick={() => onOpen(post)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(post); }}
      className="group bg-white rounded-xl border border-zinc-200/80 shadow-sm transition-all duration-200 hover:shadow-md hover:border-zinc-300 cursor-pointer"
    >
      <div className="flex items-center gap-4 p-3.5">
        <PostThumbnail url={firstCreative(post.creative_urls)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <h3 className="flex-1 text-sm font-semibold text-zinc-900 leading-snug line-clamp-1">{post.prompt_text || 'Untitled post'}</h3>
            <PostStatusBadge status={post.status} />
          </div>
          {post.caption_text && <p className="mt-1 text-[13px] text-zinc-500 line-clamp-1 leading-relaxed">{post.caption_text}</p>}
          <div className="mt-2 flex items-center gap-2.5">
            <PlatformList platforms={post.platforms} />
            <span className="w-px h-3 bg-zinc-200" />
            <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
              {post.status === 'published' ? <CircleCheck className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {postTimeline(post)}
            </span>
          </div>
          {remark && (
            <p className={cn('mt-1.5 text-[12px] line-clamp-2 leading-relaxed', remark.kind === 'rejected' ? 'text-red-600' : 'text-teal-700')}>
              <span className="font-semibold">{remark.kind === 'rejected' ? 'Rejected:' : 'Approver note:'}</span> {remark.text}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <RowActions {...props} />
          {post.status !== 'publishing' && (
            <button
              type="button"
              onClick={() => onConfirm('delete', post)}
              title="Delete post"
              aria-label="Delete post"
              className="p-1.5 rounded-lg text-zinc-300 transition-colors hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RowActions({ post, canPublish, canApprove, approving, onEdit, onConfirm, onApprove, onReject, onReschedule, onSubmitForApproval }: PostRowProps) {
  switch (post.status) {
    case 'draft':
      return (
        <>
          <Button variant="secondary" className={ACTION} onClick={() => onEdit(post)}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
          {canPublish ? (
            <Button className={ACTION} onClick={() => onConfirm('publish', post)}><Send className="w-3.5 h-3.5" /> Publish</Button>
          ) : (
            <Button variant="secondary" className={ACTION} onClick={() => onSubmitForApproval(post)}><Send className="w-3.5 h-3.5" /> Send for approval</Button>
          )}
        </>
      );
    case 'pending_approval':
      if (!canApprove) return <span className="text-xs font-medium text-violet-600 px-2">Awaiting approval</span>;
      return (
        <>
          <Button variant="secondary" className={ACTION} disabled={approving} onClick={() => onReject(post)}>Reject</Button>
          <Button variant="success" className={ACTION} disabled={approving} onClick={() => onApprove(post)}>
            {approving ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <CircleCheck className="w-3.5 h-3.5" />} Approve
          </Button>
        </>
      );
    case 'approved':
      return canPublish
        ? <Button className={ACTION} onClick={() => onConfirm('publish', post)}><Send className="w-3.5 h-3.5" /> Publish</Button>
        : <span className="text-xs font-medium text-teal-600 px-2">Ready to publish</span>;
    case 'scheduled':
      if (!canPublish) return null;
      return (
        <>
          <Button variant="secondary" className={ACTION} onClick={() => onReschedule(post)}><Clock className="w-3.5 h-3.5" /> Reschedule</Button>
          <Button variant="secondary" className={ACTION} onClick={() => onConfirm('cancel', post)}><X className="w-3.5 h-3.5" /> Cancel</Button>
        </>
      );
    case 'published': {
      const url = platformResults(post.publish_results).find((r) => r.url)?.url ?? firstCreative(post.creative_urls);
      if (!url) return null;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-700 transition-colors hover:bg-zinc-50 hover:border-zinc-300"
        >
          <ExternalLink className="w-3.5 h-3.5" /> View
        </a>
      );
    }
    case 'failed':
      return canPublish ? (
        <Button variant="secondary" className={cn(ACTION, 'text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300')} onClick={() => onConfirm('retry', post)}>
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </Button>
      ) : null;
    case 'publishing':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 px-2">
          <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> Publishing
        </span>
      );
    default:
      return null;
  }
}

export function PostRowSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-zinc-200/80 p-3.5">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-lg bg-zinc-100 animate-pulse flex-shrink-0" />
        <div className="flex-1 space-y-2.5">
          <div className="h-3.5 w-2/3 bg-zinc-100 rounded animate-pulse" />
          <div className="h-3 w-1/2 bg-zinc-100 rounded animate-pulse" />
          <div className="h-3 w-28 bg-zinc-100 rounded animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-16 bg-zinc-100 rounded-lg animate-pulse" />
          <div className="h-8 w-8 bg-zinc-100 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
}
